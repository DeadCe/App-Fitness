import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { collection, addDoc, updateDoc, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

export default function AjouterExerciceScreen({ route, navigation }) {
  const { id } = route.params || {};
  const [nom, setNom] = useState('');
  const [type, setType] = useState('');
  const [muscle, setMuscle] = useState('');
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    const chargerExistant = async () => {
      if (id) {
        try {
          const snapshot = await getDoc(doc(db, 'exercices', id));
          if (snapshot.exists()) {
            const data = snapshot.data();
            setNom(data.nom || '');
            setType(data.type || '');
            setMuscle(data.muscle || '');
          } else {
            Alert.alert("Erreur", "Exercice non trouvé.");
            navigation.goBack();
          }
        } catch (err) {
          console.error("Erreur chargement exercice :", err);
          Alert.alert("Erreur", "Impossible de charger l'exercice.");
        }
      }
      setChargement(false);
    };

    chargerExistant();
  }, [id]);

  const enregistrer = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Erreur", "Utilisateur non connecté.");
        return;
      }

      const nouveauExercice = {
        nom,
        type,
        muscle,
        auteur: user.uid,
        public: true
      };

      if (id) {
        await updateDoc(doc(db, 'exercices', id), nouveauExercice);
        Alert.alert("Succès", "Exercice mis à jour !");
      } else {
        await addDoc(collection(db, 'exercices'), nouveauExercice);
        Alert.alert("Succès", "Exercice ajouté !");
      }

      navigation.goBack();

    } catch (err) {
      console.error("Erreur sauvegarde exercice :", err);
      Alert.alert("Erreur", err.message || "Problème lors de l'enregistrement.");
    }
  };

  if (chargement) return null;

  return (
    <ScrollView contentContainerStyle={styles.formContainer}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{id ? 'Modifier' : 'Ajouter'} un exercice</Text>
      </View>

      <Text style={styles.label}>Nom</Text>
      <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder="Nom" placeholderTextColor="#aaa" />

      <Text style={styles.label}>Type</Text>
      <TextInput style={styles.input} value={type} onChangeText={setType} placeholder="Type" placeholderTextColor="#aaa" />

      <Text style={styles.label}>Muscle ciblé</Text>
      <TextInput style={styles.input} value={muscle} onChangeText={setMuscle} placeholder="Muscle" placeholderTextColor="#aaa" />

      <TouchableOpacity style={styles.button} onPress={enregistrer}>
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
    marginBottom: 20
  },
  backButton: {
    marginRight: 10
  },
  backText: {
    fontSize: 26,
    color: '#fff'
  },
  title: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold'
  },
  label: {
    color: '#00aaff',
    marginTop: 10
  },
  input: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10
  },
  button: {
    backgroundColor: '#007ACC',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 30
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold'
  }
});
