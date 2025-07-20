import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { doc, getDoc, getDocs, collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

export default function LancerSeanceScreen({ route, navigation }) {
  const { idSeance } = route.params;
  const [seance, setSeance] = useState(null);
  const [exercicesMap, setExercicesMap] = useState({});
  const [performances, setPerformances] = useState({});

  useEffect(() => {
    const charger = async () => {
      try {
        if (!idSeance) return;

        const docRef = doc(db, 'seances', idSeance);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) throw new Error('Séance non trouvée');

        setSeance({ id: docSnap.id, ...docSnap.data() });

        const snapshotExos = await getDocs(collection(db, 'exercices'));
        const listeExos = snapshotExos.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const map = {};
        listeExos.forEach((exo) => { map[exo.id] = exo; });
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

  const terminerSeance = async () => {
  const utilisateur = auth.currentUser;
  if (!utilisateur) {
    Alert.alert('Erreur', 'Aucun utilisateur connecté.');
    return;
  }

  try {
    const exercicesEnregistrements = (seance.exercices || [])
      .map((exoId) => {
        const exo = exercicesMap[exoId];
        const perf = performances[exoId] || {};
        const seriesNettoyees = (perf.series || [])
          .map((s) => ({
            poids: Number(s?.poids) || 0,
            repetitions: Number(s?.repetitions) || 0,
          }));
        return {
          idExercice: exoId,
          nom: exo.nom || 'Sans nom',
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
    console.log('Nouvelle entrée prête à être sauvegardée :', nouvelleEntree);

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

      {seance?.exercices?.map((exoId) => (
        exercicesMap[exoId] ? (
          <TouchableOpacity
            key={exoId}
            onPress={() => allerSaisir(exoId)}
            style={styles.exerciceCard}
          >
            <Text style={styles.exerciceText}>{exercicesMap[exoId].nom}</Text>
            {performances[exoId] && <Text style={styles.valide}>✅ Enregistré</Text>}
          </TouchableOpacity>
        ) : null
      ))}

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
    position: 'relative'
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10
  },
  backText: { fontSize: 26, color: '#fff' },
  title: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center'
  },
  exerciceCard: {
    backgroundColor: '#2a2a2a',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10
  },
  exerciceText: { color: '#ffffff', fontSize: 16 },
  valide: { color: '#00ff00', fontSize: 14, marginTop: 5 },
  button: {
    backgroundColor: '#007ACC',
    borderRadius: 10,
    padding: 15,
    marginTop: 20,
    alignItems: 'center'
  },
  buttonText: { color: '#ffffff', fontWeight: 'bold' }
});