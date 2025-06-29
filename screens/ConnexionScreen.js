import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, addDoc } from 'firebase/firestore';
import { auth } from '../firebase'; 

export default function ConnexionScreen({ navigation }) {
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [enCreation, setEnCreation] = useState(false);
  const [mdpVisible, setMdpVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);

  const seConnecter = async () => {
    if (!identifiant || !motDePasse) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, identifiant, motDePasse);
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Root' }],
        })
      );
    } catch (error) {
      Alert.alert("Connexion échouée", error.message);
    }
    const creerCompte = async () => {
  if (!identifiant || !motDePasse || !confirmation) {
    Alert.alert("Erreur", "Veuillez remplir tous les champs.");
    return;
  }

  if (motDePasse !== confirmation) {
    Alert.alert("Erreur", "Les mots de passe ne correspondent pas.");
    return;
  }

  try {
    const { user } = await createUserWithEmailAndPassword(auth, identifiant, motDePasse);

    // Optionnel : ajoute une entrée dans Firestore
    const { setDoc, doc } = await import('firebase/firestore');
    const { db } = await import('../firebase');
    await setDoc(doc(db, "utilisateurs", user.uid), {
      identifiant: identifiant,
      poids: null,
      taille: null,
      dateNaissance: null,
    });

    Alert.alert("Succès", "Compte créé avec succès !");
    setEnCreation(false);
    setConfirmation('');
    setMotDePasse('');
  } catch (error) {
    Alert.alert("Erreur", error.message);
  }
};

  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {enCreation && (
          <TouchableOpacity
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>
          {enCreation ? "Créer un compte" : "Connexion"}
        </Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Adresse e-mail"
        placeholderTextColor="#aaa"
        value={identifiant}
        onChangeText={setIdentifiant}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        placeholderTextColor="#aaa"
        secureTextEntry={!mdpVisible}
        value={motDePasse}
        onChangeText={setMotDePasse}
      />
      <TouchableOpacity onPress={() => setMdpVisible(!mdpVisible)}>
        <Text style={styles.showHide}>
          {mdpVisible ? "Masquer" : "Afficher"} le mot de passe
        </Text>
      </TouchableOpacity>

      {enCreation && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Confirmer le mot de passe"
            placeholderTextColor="#aaa"
            secureTextEntry={!confirmationVisible}
            value={confirmation}
            onChangeText={setConfirmation}
          />
          <TouchableOpacity onPress={() => setConfirmationVisible(!confirmationVisible)}>
            <Text style={styles.showHide}>
              {confirmationVisible ? "Masquer" : "Afficher"} la confirmation
            </Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity style={styles.button} onPress={enCreation ? creerCompte : seConnecter}>
        <Text style={styles.buttonText}>
          {enCreation ? "Créer mon compte" : "Se connecter"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setEnCreation(!enCreation)}>
        <Text style={styles.link}>
          {enCreation ? "J'ai déjà un compte" : "Créer un compte"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e1e', justifyContent: 'center', padding: 20 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 60, marginBottom: 10, position: 'relative'
  },
  backButton: {
    position: 'absolute', left: 0, top: 0, width: 50, height: 50,
    justifyContent: 'center', alignItems: 'center', zIndex: 10
  },
  backText: { fontSize: 26, color: '#fff', marginBottom: 2 },
  title: { fontSize: 20, color: '#fff', fontWeight: 'bold', flex: 1, textAlign: 'center' },
  input: {
    backgroundColor: '#2a2a2a', borderRadius: 5, padding: 10,
    color: '#fff', marginBottom: 10
  },
  showHide: { color: '#aaa', textAlign: 'right', marginBottom: 10 },
  button: {
    backgroundColor: '#007ACC', borderRadius: 8, padding: 15,
    alignItems: 'center', marginTop: 10
  },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  link: { color: '#00aaff', marginTop: 15, textAlign: 'center' }
});
 