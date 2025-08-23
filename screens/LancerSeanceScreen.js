import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { doc, getDoc, getDocs, collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

export default function LancerSeanceScreen({ route, navigation }) {
  const { idSeance } = route.params;
  const [seance, setSeance] = useState(null);
  const [exercicesMap, setExercicesMap] = useState({});
  const [performances, setPerformances] = useState({});
  const [exercicesActuels, setExercicesActuels] = useState([]);
  const [tousLesExercices, setTousLesExercices] = useState([]);

  useEffect(() => {
    const charger = async () => {
      try {
        if (!idSeance) return;

        const utilisateur = auth.currentUser;
        if (!utilisateur) return;

        const docRef = doc(db, 'seances', idSeance);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) throw new Error('Séance non trouvée');

        const seanceData = { id: docSnap.id, ...docSnap.data() };
        setSeance(seanceData);
        setExercicesActuels(seanceData.exercices || []);

        const snapshotExos = await getDocs(collection(db, 'exercices'));
        const listeExos = snapshotExos.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        const accessibles = listeExos.filter(
          (ex) => ex.auteur === utilisateur.uid || ex.public === true
        );

        const map = {};
        listeExos.forEach((exo) => {
          map[exo.id] = exo;
        });

        setTousLesExercices(accessibles);
        setExercicesMap(map);
      } catch (err) {
        console.error('Erreur de chargement :', err);
        Alert.alert('Erreur', 'Impossible de charger la séance.');
      }
    };

    charger();
  }, [idSeance]);

  const allerSaisir = (exoId) => {
    const utilisateur = auth.currentUser;
    if (!utilisateur) {
      Alert.alert('Erreur', 'Aucun utilisateur connecté.');
      return;
    }

    navigation.navigate('SaisieExercice', {
      idExercice: exoId,
      utilisateursChoisis: [utilisateur],
      performancesExistantes: performances[exoId],
      onSave: (nouvellePerf) => {
        setPerformances((prev) => ({
          ...prev,
          [exoId]: nouvellePerf,
        }));
      },
    });
  };

  const remplacerExercice = (index) => {
    const autres = tousLesExercices.filter(
      (e) => !exercicesActuels.includes(e.id)
    );

    if (autres.length === 0) {
      Alert.alert('Aucun autre exercice disponible');
      return;
    }

    Alert.alert(
      'Remplacer exercice',
      'Choisissez un exercice à la place :',
      autres.map((e) => ({
        text: e.nom,
        onPress: () => {
          const copie = [...exercicesActuels];
          copie[index] = e.id;
          setExercicesActuels(copie);
        },
      }))
    );
  };

  const ajouterExercice = () => {
    const disponibles = tousLesExercices.filter(
      (e) => !exercicesActuels.includes(e.id)
    );

    if (disponibles.length === 0) {
      Alert.alert('Aucun exercice à ajouter');
      return;
    }

    Alert.alert(
      'Ajouter exercice',
      'Choisissez un exercice à ajouter :',
      disponibles.map((e) => ({
        text: e.nom,
        onPress: () => {
          setExercicesActuels([...exercicesActuels, e.id]);
        },
      }))
    );
  };

  const terminerSeance = async () => {
    const utilisateur = auth.currentUser;
    if (!utilisateur) {
      Alert.alert('Erreur', 'Aucun utilisateur connecté.');
      return;
    }

    try {
      const exercicesEnregistrements = (exercicesActuels || [])
        .map((exoId) => {
          const exo = exercicesMap[exoId];
          const perf = performances[exoId] || {};
          const seriesNettoyees = (perf.series || []).map((s) => ({
            poids: Number(s?.poids) || 0,
            repetitions: Number(s?.repetitions) || 0,
          }));

          return {
            idExercice: exoId,
            nom: exo?.nom || 'Sans nom',
            performances: {
              series: seriesNettoyees,
            },
          };
        })
        .filter((e) => e !== null);

      const nouvelleEntree = {
        date: new Date().toISOString(),
        seance: seance.nom,
        utilisateurId: utilisateur.uid,
        exercices: exercicesEnregistrements,
      };

      await addDoc(collection(db, 'historiqueSeances'), nouvelleEntree);
      navigation.replace('RécapitulatifSéance', { nouvelleEntree });
    } catch (err) {
      console.error('Erreur sauvegarde séance :', err);
      Alert.alert('Erreur', "Impossible d'enregistrer la séance.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Séance : {seance?.nom}</Text>
      </View>

      {exercicesActuels.map((exoId, index) =>
        exercicesMap[exoId] ? (
          <View key={exoId} style={styles.exerciceCard}>
            <TouchableOpacity onPress={() => allerSaisir(exoId)}>
              <Text style={styles.exerciceText}>{exercicesMap[exoId].nom}</Text>
              {performances[exoId] && <Text style={styles.valide}>✅ Enregistré</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => remplacerExercice(index)}>
              <Text style={styles.switchIcon}>🔄</Text>
            </TouchableOpacity>
          </View>
        ) : null
      )}

      <TouchableOpacity onPress={ajouterExercice} style={styles.addButton}>
        <Text style={styles.buttonText}>➕ Ajouter un exercice</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={terminerSeance}>
        <Text style={styles.buttonText}>Terminer la séance</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#1e1e1e', padding: 20, flexGrow: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    marginBottom: 10,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  backText: { fontSize: 26, color: '#fff' },
  title: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  exerciceCard: {
    backgroundColor: '#2a2a2a',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciceText: { color: '#ffffff', fontSize: 16 },
  valide: { color: '#00ff00', fontSize: 14, marginTop: 5 },
  switchIcon: { fontSize: 22, color: '#00aaff' },
  addButton: {
    backgroundColor: '#444',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 15,
  },
  button: {
    backgroundColor: '#007ACC',
    borderRadius: 10,
    padding: 15,
    marginTop: 20,
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontWeight: 'bold' },
});
