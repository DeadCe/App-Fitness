import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useIsFocused } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';

export default function ConsulterSeanceScreen({ route, navigation }) {
  const { index } = route.params;
  const [nomSeance, setNomSeance] = useState('');
  const [exercices, setExercices] = useState([]);
  const [seanceCible, setSeanceCible] = useState(null);
  const isFocused = useIsFocused();

  useEffect(() => {
    const charger = async () => {
      try {
        const utilisateur = auth.currentUser;
        if (!utilisateur) return;

        const exSnapshot = await getDocs(collection(db, "exercices"));
        const tousEx = exSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        const seanceSnapshot = await getDocs(collection(db, "seances"));
        const toutes = seanceSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const seance = toutes[index];

        if (seance) {
          setNomSeance(seance.nom);
          setSeanceCible(seance);
          const exercicesAssoc = seance.exercices.map(id => tousEx.find(e => e.id === id)).filter(Boolean);
          setExercices(exercicesAssoc);
        } else {
          Alert.alert("Erreur", "Séance non trouvée.");
        }
      } catch (err) {
        console.error("Erreur chargement séance :", err);
        Alert.alert("Erreur", "Impossible de charger la séance.");
      }
    };

    if (isFocused) charger();
  }, [isFocused]);

  const dupliquerSeance = async () => {
    try {
      const utilisateur = auth.currentUser;
      if (!utilisateur || !seanceCible) return;

      const nouvelle = {
        ...seanceCible,
        auteur: utilisateur.uid,
        public: false,
        nom: `${seanceCible.nom} (copie)`,
        date: new Date().toISOString(),
        idMere: seanceCible.idMere || seanceCible.id
      };
      delete nouvelle.id;

      await addDoc(collection(db, "seances"), nouvelle);
      Alert.alert("Succès", "Séance dupliquée !");
      navigation.goBack();
    } catch (err) {
      console.error("Erreur duplication :", err);
      Alert.alert("Erreur", "Impossible de dupliquer la séance.");
    }
  };

  const utilisateur = auth.currentUser;
  const estAuteur = utilisateur && utilisateur.uid === seanceCible?.auteur;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{nomSeance || "Séance"}</Text>
      </View>

      <Text style={styles.label}>Exercices :</Text>
      {exercices.map((ex, idx) => (
        <View key={ex.id || idx} style={styles.exerciceItem}>
          <Text style={styles.exerciceText}>{ex.nom}</Text>
          {ex.muscle ? <Text style={styles.sousTexte}>Muscle : {ex.muscle}</Text> : null}
          {ex.type ? <Text style={styles.sousTexte}>Type : {ex.type}</Text> : null}
        </View>
      ))}

      {!estAuteur && (
        <TouchableOpacity style={styles.button} onPress={dupliquerSeance}>
          <Text style={styles.buttonText}>Dupliquer cette séance</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
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
    fontSize: 16,
    marginBottom: 10,
    marginTop: 10
  },
  exerciceItem: {
    backgroundColor: '#2a2a2a',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10
  },
  exerciceText: {
    color: '#fff',
    fontSize: 16
  },
  sousTexte: {
    color: '#aaa',
    fontSize: 12
  },
  button: {
    backgroundColor: '#007ACC',
    borderRadius: 10,
    padding: 12,
    marginTop: 30,
    alignItems: 'center'
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold'
  }
});
