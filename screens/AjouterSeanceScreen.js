import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { collection, addDoc, updateDoc, doc, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { useIsFocused } from '@react-navigation/native';

export default function AjouterSeanceScreen({ route, navigation }) {
  const { index } = route.params;
  const [nom, setNom] = useState('');
  const [selection, setSelection] = useState([]); // tableau d'index locaux
  const [tousLesExercices, setTousLesExercices] = useState([]);
  const [toutesLesSeances, setToutesLesSeances] = useState([]);

  const isFocused = useIsFocused();

  useEffect(() => {
    const charger = async () => {
      try {
        const utilisateur = auth.currentUser;
        if (!utilisateur || !utilisateur.uid) {
          Alert.alert("Erreur", "Utilisateur non connecté.");
          return;
        }

        // Récupère tous les exercices accessibles (perso + publics)
        const exSnapshot = await getDocs(collection(db, "exercices"));
        const exList = exSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(ex => ex.auteur === utilisateur.uid || ex.public === true);
        setTousLesExercices(exList);

        // Récupère toutes les séances
        const snapshot = await getDocs(collection(db, "seances"));
        const seancesFirestore = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setToutesLesSeances(seancesFirestore);

        // Mode édition
        if (index >= 0 && seancesFirestore[index]) {
          const seance = seancesFirestore[index];
          setNom(seance.nom || '');
          const indices = seance.exercices
            .map(id => exList.findIndex(e => e.id === id))
            .filter(i => i !== -1);
          setSelection(indices);
        }

      } catch (err) {
        console.error("Erreur lors du chargement :", err);
        Alert.alert("Erreur", "Impossible de charger les données.");
      }
    };

    if (isFocused) charger();
  }, [isFocused]);

  const toggleExercice = (i) => {
    setSelection((prev) =>
      prev.includes(i) ? prev.filter((id) => id !== i) : [...prev, i]
    );
  };

  const sauvegarder = async () => {
    try {
      const utilisateur = auth.currentUser;
      if (!utilisateur || !utilisateur.uid) {
        Alert.alert("Erreur", "Utilisateur non connecté.");
        return;
      }

      const idsExercices = selection.map(i => tousLesExercices[i]?.id).filter(Boolean);

      let nouvelleSeance = {
        nom,
        exercices: idsExercices,
        auteur: utilisateur.uid,
        public: true,
        date: new Date().toISOString()
      };

      if (index >= 0 && toutesLesSeances[index]) {
        const seanceExistante = toutesLesSeances[index];
        nouvelleSeance.idMere = seanceExistante.idMere || seanceExistante.id;
        await updateDoc(doc(db, "seances", seanceExistante.id), nouvelleSeance);
        Alert.alert("Succès", "Séance modifiée !");
      } else {
        await addDoc(collection(db, "seances"), {
          ...nouvelleSeance,
          idMere: uuidv4()
        });
        Alert.alert("Succès", "Séance ajoutée !");
      }

      navigation.goBack();

    } catch (err) {
      console.error("Erreur Firestore :", err);
      Alert.alert("Erreur", err.message || "Impossible d'enregistrer.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.formContainer}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {index >= 0 ? 'Modifier' : 'Ajouter'} une séance
        </Text>
      </View>

      <Text style={styles.label}>Nom de la séance</Text>
      <TextInput
        style={styles.input}
        value={nom}
        onChangeText={setNom}
        placeholder="Nom"
        placeholderTextColor="#aaa"
      />

      <Text style={[styles.label, { marginTop: 20 }]}>Exercices :</Text>
      {tousLesExercices.map((ex, i) => (
        <TouchableOpacity
          key={ex.id}
          onPress={() => toggleExercice(i)}
          style={[
            styles.exerciceItem,
            selection.includes(i) && styles.exerciceItemSelected
          ]}
        >
          <Text style={{ color: '#fff' }}>{ex.nom}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.button} onPress={sauvegarder}>
        <Text style={styles.buttonText}>Sauvegarder</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    padding: 20,
    backgroundColor: '#1e1e1e',
    flexGrow: 1
  },
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
  backText: {
    fontSize: 26,
    color: '#fff'
  },
  title: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center'
  },
  label: {
    color: '#ffffff',
    marginBottom: 5
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    color: '#ffffff',
    backgroundColor: '#2a2a2a'
  },
  exerciceItem: {
    backgroundColor: '#2a2a2a',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10
  },
  exerciceItemSelected: {
    borderColor: '#00aaff',
    borderWidth: 2
  },
  button: {
    backgroundColor: '#007ACC',
    borderRadius: 10,
    padding: 10,
    marginTop: 30,
    alignItems: 'center'
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold'
  }
});
