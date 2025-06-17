import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { collection, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

export default function ConsulterExerciceScreen({ route, navigation }) {
  const { id } = route.params;
  const [exercice, setExercice] = useState(null);
  const [utilisateur, setUtilisateur] = useState(null);

  useEffect(() => {
    const charger = async () => {
      try {
        const utilisateurActuel = auth.currentUser;
        if (!utilisateurActuel) return;

        setUtilisateur(utilisateurActuel);

        const docRef = doc(db, "exercices", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setExercice({ id: docSnap.id, ...docSnap.data() });
        } else {
          Alert.alert("Erreur", "Exercice non trouvé.");
        }
      } catch (err) {
        console.error("Erreur lors du chargement de l'exercice :", err);
        Alert.alert("Erreur", "Impossible de charger l'exercice.");
      }
    };

    charger();
  }, []);

  if (!exercice) return null;

  const estAuteur = exercice.auteur === utilisateur?.uid;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Consulter un exercice</Text>
      </View>

      <Text style={styles.label}>Nom :</Text>
      <Text style={styles.value}>{exercice.nom}</Text>

      <Text style={styles.label}>Type :</Text>
      <Text style={styles.value}>{exercice.type || 'Non spécifié'}</Text>

      <Text style={styles.label}>Muscle ciblé :</Text>
      <Text style={styles.value}>{exercice.muscle || 'Non spécifié'}</Text>

      <Text style={styles.label}>Créé par :</Text>
      <Text style={styles.value}>{exercice.auteur}</Text>

      {estAuteur && (
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => navigation.navigate('AjouterExercice', { index: -1, id })}
        >
          <Text style={styles.buttonText}>Modifier cet exercice</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e1e', padding: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20
  },
  backButton: {
    marginRight: 10
  },
  backText: {
    color: '#fff',
    fontSize: 26
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold'
  },
  label: {
    color: '#00aaff',
    marginTop: 10,
    fontSize: 16
  },
  value: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 10
  },
  editButton: {
    backgroundColor: '#007ACC',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 30
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold'
  }
});
