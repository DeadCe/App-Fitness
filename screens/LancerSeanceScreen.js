import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, Modal, FlatList
} from 'react-native';
import { doc, getDoc, getDocs, collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

export default function LancerSeanceScreen({ route, navigation }) {
  const { idSeance } = route.params;
  const [seance, setSeance] = useState(null);
  const [exercicesMap, setExercicesMap] = useState({});
  const [performances, setPerformances] = useState({});
  const [exercicesTemp, setExercicesTemp] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [exoRemplacementIndex, setExoRemplacementIndex] = useState(null);

  useEffect(() => {
    const charger = async () => {
      try {
        if (!idSeance) return;

        const docRef = doc(db, 'seances', idSeance);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) throw new Error('Séance non trouvée');

        const seanceData = { id: docSnap.id, ...docSnap.data() };
        setSeance(seanceData);
        setExercicesTemp(seanceData.exercices || []);

        const utilisateur = auth.currentUser;
        const snapshotExos = await getDocs(collection(db, 'exercices'));
        const listeExos = snapshotExos.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(ex => ex.auteur === utilisateur.uid || ex.public === true);

        const map = {};
        listeExos.forEach(exo => { map[exo.id] = exo; });
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
      const exercicesEnregistrements = exercicesTemp.map((exoId) => {
        const exo = exercicesMap[exoId];
        const perf = performances[exoId] || {};
        const seriesNettoyees = (perf.series || []).map((s) => ({
          poids: Number(s?.poids) || 0,
          repetitions: Number(s?.repetitions) || 0,
        }));
        return {
          idExercice: exoId,
          nom: exo?.nom || 'Sans nom',
          performances: { series: seriesNettoyees },
        };
      });

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

  const ouvrirModal = (index = null) => {
    setExoRemplacementIndex(index); // null = ajout
    setModalVisible(true);
  };

  const ajouterOuRemplacerExercice = (exoId) => {
    if (exoRemplacementIndex !== null) {
      const temp = [...exercicesTemp];
      temp[exoRemplacementIndex] = exoId;
      setExercicesTemp(temp);
    } else {
      setExercicesTemp((prev) => [...prev, exoId]);
    }
    setModalVisible(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Séance : {seance?.nom}</Text>
      </View>

      {exercicesTemp.map((exoId, index) => (
        <View key={index} style={styles.exerciceCard}>
          <TouchableOpacity onPress={() => allerSaisir(exoId)}>
            <Text style={styles.exerciceText}>{exercicesMap[exoId]?.nom || 'Exercice inconnu'}</Text>
            {performances[exoId] && <Text style={styles.valide}>✅ Enregistré</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => ouvrirModal(index)} style={styles.switchButton}>
            <Text style={{ color: '#00aaff' }}>🔄</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={styles.addButton} onPress={() => ouvrirModal(null)}>
        <Text style={styles.buttonText}>+ Ajouter un exercice</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.terminateButton} onPress={terminerSeance}>
        <Text style={styles.buttonText}>Terminer la séance</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalBackground}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choisir un exercice</Text>
            <FlatList
              data={Object.values(exercicesMap)}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => ajouterOuRemplacerExercice(item.id)}
                  style={styles.modalItem}
                >
                  <Text style={{ color: '#fff' }}>{item.nom}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={{ color: '#00aaff', textAlign: 'center', marginTop: 10 }}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#1e1e1e', padding: 20, flexGrow: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 60, marginBottom: 10, position: 'relative'
  },
  backButton: { position: 'absolute', left: 0, top: 0, width: 50, height: 50, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 26, color: '#fff' },
  title: { fontSize: 20, color: '#fff', fontWeight: 'bold', flex: 1, textAlign: 'center' },
  exerciceCard: {
    backgroundColor: '#2a2a2a', padding: 15, borderRadius: 10,
    marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  },
  exerciceText: { color: '#ffffff', fontSize: 16 },
  valide: { color: '#00ff00', fontSize: 14, marginTop: 5 },
  switchButton: { paddingHorizontal: 10 },
  addButton: {
    backgroundColor: '#444', borderRadius: 10, padding: 15, marginTop: 10, alignItems: 'center'
  },
  terminateButton: {
    backgroundColor: '#007ACC', borderRadius: 10, padding: 15, marginTop: 20, alignItems: 'center'
  },
  buttonText: { color: '#ffffff', fontWeight: 'bold' },
  modalBackground: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center'
  },
  modalContent: {
    backgroundColor: '#2a2a2a', padding: 20, borderRadius: 10, width: '90%', maxHeight: '80%'
  },
  modalTitle: { color: '#00aaff', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  modalItem: {
    padding: 10, borderBottomWidth: 1, borderBottomColor: '#444'
  }
});
