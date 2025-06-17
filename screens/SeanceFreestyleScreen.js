import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from '../firebase';
import {
  collection,
  getDocs,
  doc,
  addDoc,
  getDoc
} from 'firebase/firestore';

export default function SeanceFreestyleScreen() {
  const navigation = useNavigation();
  const [exercicesDispo, setExercicesDispo] = useState([]);
  const [exercicesSelectionnes, setExercicesSelectionnes] = useState([]);
  const [performances, setPerformances] = useState({});

  useEffect(() => {
    const charger = async () => {
      const snapshot = await getDocs(collection(db, "exercices"));
      const liste = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setExercicesDispo(liste);
    };
    charger();
  }, []);

  const ajouterExercice = (idExercice) => {
    if (!exercicesSelectionnes.includes(idExercice)) {
      setExercicesSelectionnes([...exercicesSelectionnes, idExercice]);
    }
  };

  const allerSaisir = async (idExercice) => {
    const utilisateur = auth.currentUser;
    if (!utilisateur) {
      Alert.alert("Erreur", "Aucun utilisateur connecté.");
      return;
    }

    navigation.navigate('SaisieExercice', {
      idExercice,
      utilisateursChoisis: [utilisateur],
      onSave: (nouvellePerf) => {
        const exo = exercicesDispo.find(e => e.id === idExercice);
        setPerformances(prev => ({
          ...prev,
          [idExercice]: {
            ...nouvellePerf,
            nom: exo?.nom || "Exercice",
          },
        }));
      },
    });
  };

  const terminerSeance = async () => {
    const utilisateur = auth.currentUser;
    if (!utilisateur) {
      Alert.alert("Erreur", "Aucun utilisateur connecté.");
      return;
    }

    const nouvelleEntree = {
      date: new Date().toISOString(),
      seance: "Séance freestyle",
      utilisateurId: utilisateur.uid,
      utilisateurs: [utilisateur.uid],
      performances,
    };

    await addDoc(collection(db, "performances"), nouvelleEntree);

    console.log('Données envoyées au récap :', nouvelleEntree);
    navigation.replace('RécapitulatifSéance', { nouvelleEntree });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={{ fontSize: 26, color: '#fff' }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Séance freestyle</Text>
      </View>

      <TouchableOpacity
        style={styles.addBtn}
        onPress={() =>
          navigation.navigate('ListeExercice', {
            onSelect: ajouterExercice,
          })
        }
      >
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>+ Ajouter un exercice</Text>
      </TouchableOpacity>

      {exercicesSelectionnes.length === 0 && (
        <Text style={{ color: '#aaa', textAlign: 'center', marginTop: 20 }}>
          Aucun exercice pour l’instant
        </Text>
      )}

      {exercicesSelectionnes.map((id, index) => {
        const exo = exercicesDispo.find(e => e.id === id);
        return (
          <TouchableOpacity key={id} onPress={() => allerSaisir(id)} style={styles.exerciceCard}>
            <Text style={styles.exerciceText}>{exo?.nom || "Exercice inconnu"}</Text>
            {performances[id] && <Text style={styles.valide}>✅ Enregistré</Text>}
          </TouchableOpacity>
        );
      })}

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
  back: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10
  },
  title: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1
  },
  addBtn: {
    backgroundColor: '#00384D',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center'
  },
  exerciceCard: {
    backgroundColor: '#2a2a2a',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10
  },
  exerciceText: {
    color: '#ffffff',
    fontSize: 16
  },
  valide: {
    color: '#00ff00',
    fontSize: 14,
    marginTop: 5
  },
  button: {
    backgroundColor: '#007ACC',
    borderRadius: 10,
    padding: 15,
    marginTop: 20,
    alignItems: 'center'
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold'
  }
});
