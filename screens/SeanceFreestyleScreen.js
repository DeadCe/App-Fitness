import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from '../firebase';
import { collection, getDocs, addDoc } from 'firebase/firestore';

export default function SeanceFreestyleScreen() {
  const navigation = useNavigation();
  const [exercicesDispo, setExercicesDispo] = useState([]);
  const [exercicesSelectionnes, setExercicesSelectionnes] = useState([]);
  const [performances, setPerformances] = useState({});

  // Chargement des exercices depuis Firestore
  useEffect(() => {
    const charger = async () => {
      const snapshot = await getDocs(collection(db, 'exercices'));
      const liste = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setExercicesDispo(liste);
    };
    charger();
  }, []);

  const ajouterExercice = (idExercice) => {
    if (!exercicesSelectionnes.includes(idExercice)) {
      setExercicesSelectionnes((prev) => [...prev, idExercice]);
    }
  };

  const allerSaisir = (idExercice) => {
    const utilisateur = auth.currentUser;
    if (!utilisateur) {
      Alert.alert('Erreur', 'Aucun utilisateur connecté.');
      return;
    }

    navigation.navigate('SaisieExercice', {
      idExercice,
      utilisateursChoisis: [utilisateur],
      onSave: (nouvellePerf) => {
        const exo = exercicesDispo.find((e) => e.id === idExercice);
        setPerformances((prev) => ({
          ...prev,
          [idExercice]: {
            ...nouvellePerf,
            nom: exo?.nom || 'Exercice',
          },
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
    const exercicesEnregistrements = exercicesSelectionnes
      .map((idEx) => {
        const exo = exercicesDispo.find((e) => e.id === idEx);
        if (!exo) return null;

        // Nettoyage des performances
        const perfs = performances[idEx] || {};
        return {
          idExercice: idEx,
          nom: exo.nom || 'Sans nom',
          performances: {
            nom: perfs.nom || 'Sans nom',
            series: Array.isArray(perfs.series)
              ? perfs.series.map((s) => ({
                  poids: s?.poids ?? 0,
                  repetitions: s?.repetitions ?? 0,
                }))
              : [],
          },
        };
      })
      .filter(Boolean); // supprime les nulls

    if (exercicesEnregistrements.length === 0) {
      Alert.alert('Erreur', 'Aucun exercice à sauvegarder.');
      return;
    }

    const nouvelleEntree = {
      date: new Date().toISOString(),
      seance: 'Séance freestyle',
      utilisateurId: utilisateur.uid,
      exercices: exercicesEnregistrements,
    };
    console.log('Nouvelle entrée prête à être sauvegardée:', nouvelleEntree);

    await addDoc(collection(db, 'historiqueSeances'), nouvelleEntree);
    navigation.replace('RécapitulatifSéance', { nouvelleEntree });
  } catch (err) {
    console.error('Erreur sauvegarde séance freestyle :', err);
    Alert.alert('Erreur', "Impossible d'enregistrer la séance.");
  }
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
        onPress={() => navigation.navigate('ListeExercice', { onSelect: ajouterExercice })}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>+ Ajouter un exercice</Text>
      </TouchableOpacity>

      {exercicesSelectionnes.length === 0 && (
        <Text style={{ color: '#aaa', textAlign: 'center', marginTop: 20 }}>
          Aucun exercice pour l’instant
        </Text>
      )}

      {exercicesSelectionnes.map((id) => {
        const exo = exercicesDispo.find((e) => e.id === id);
        return (
          <TouchableOpacity key={id} onPress={() => allerSaisir(id)} style={styles.exerciceCard}>
            <Text style={styles.exerciceText}>{exo?.nom || 'Exercice inconnu'}</Text>
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

// Styles
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
  back: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  title: { fontSize: 20, color: '#fff', fontWeight: 'bold', textAlign: 'center', flex: 1 },
  addBtn: {
    backgroundColor: '#00384D',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  exerciceCard: {
    backgroundColor: '#2a2a2a',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  exerciceText: {
    color: '#ffffff',
    fontSize: 16,
  },
  valide: {
    color: '#00ff00',
    fontSize: 14,
    marginTop: 5,
  },
  button: {
    backgroundColor: '#007ACC',
    borderRadius: 10,
    padding: 15,
    marginTop: 20,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});
