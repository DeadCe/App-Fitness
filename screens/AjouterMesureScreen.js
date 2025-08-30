import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { auth, db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function AjouterMesureScreen({ navigation }) {
  const [poids, setPoids] = useState('');
  const [masseGrasse, setMasseGrasse] = useState('');
  const [masseMusculaire, setMasseMusculaire] = useState('');
  const [saving, setSaving] = useState(false);

  const sauvegarder = async () => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Erreur", "Aucun utilisateur connecté.");
      return;
    }

    // conversion en nombres
    const p = poids ? Number(String(poids).replace(',', '.')) : null;
    const mg = masseGrasse ? Number(String(masseGrasse).replace(',', '.')) : null;
    const mm = masseMusculaire ? Number(String(masseMusculaire).replace(',', '.')) : null;

    if (p === null || Number.isNaN(p)) {
      Alert.alert("Erreur", "Merci de renseigner un poids valide.");
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "mesures"), {
        utilisateurId: user.uid,   // ✅ cohérent avec la lecture
        poids: p,
        masseGrasse: mg ?? null,
        masseMusculaire: mm ?? null,
        date: serverTimestamp(),   // ✅ date Firestore
        createdAt: serverTimestamp(),
      });

      Alert.alert("Succès", "Mesure ajoutée !");
      navigation.goBack();
    } catch (error) {
      console.error("Erreur Firestore :", error);
      Alert.alert("Erreur", "Impossible d'ajouter la mesure.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ajouter une mesure</Text>
      </View>

      <Text style={styles.label}>Poids (kg)*</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={poids}
        onChangeText={setPoids}
        placeholder="Ex: 75"
        placeholderTextColor="#aaa"
      />

      <Text style={styles.label}>Masse grasse (%)</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={masseGrasse}
        onChangeText={setMasseGrasse}
        placeholder="Ex: 15"
        placeholderTextColor="#aaa"
      />

      <Text style={styles.label}>Masse musculaire (%)</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={masseMusculaire}
        onChangeText={setMasseMusculaire}
        placeholder="Ex: 40"
        placeholderTextColor="#aaa"
      />

      <TouchableOpacity style={styles.button} onPress={sauvegarder} disabled={saving}>
        <Text style={styles.buttonText}>
          {saving ? "Enregistrement..." : "Sauvegarder"}
        </Text>
      </TouchableOpacity>
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
    marginBottom: 20
  },
  backText: {
    color: '#fff',
    fontSize: 26,
    marginRight: 15
  },
  title: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold'
  },
  label: {
    color: '#fff',
    marginBottom: 5,
    marginTop: 15
  },
  input: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
    borderRadius: 5,
    padding: 10
  },
  button: {
    backgroundColor: '#007ACC',
    borderRadius: 10,
    padding: 15,
    marginTop: 30,
    alignItems: 'center'
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold'
  }
});
