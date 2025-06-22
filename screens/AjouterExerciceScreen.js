import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Image } from 'react-native';
import { collection, addDoc, updateDoc, doc, getDoc } from 'firebase/firestore';
import { db, auth, storage } from '../firebase';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function AjouterExerciceScreen({ route, navigation }) {
  const { id } = route.params || {};
  const [nom, setNom] = useState('');
  const [type, setType] = useState('');
  const [muscle, setMuscle] = useState('');
  const [imageUri, setImageUri] = useState(null);    // 🖼 Nouvelle image locale
  const [imageUrl, setImageUrl] = useState(null);    // 🖼 URL Firestore
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
            setImageUrl(data.imageUrl || null); // charger l’image existante
          } else {
            Alert.alert('Erreur', 'Exercice non trouvé.');
            navigation.goBack();
          }
        } catch (err) {
          console.error('Erreur chargement exercice:', err);
          Alert.alert('Erreur', "Impossible de charger l'exercice.");
        }
      }
      setChargement(false);
    };
    chargerExistant();
  }, [id]);

  // 📸 Sélectionner une image dans la galerie
  const choisirImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Erreur', 'Permission refusée pour accéder à la galerie.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true });
    if (!result.canceled) {
      setImageUri(result.assets[0].uri); // URI temporaire
    }
  };

  // 📤 Uploader l’image dans Storage
  const uploaderImage = async () => {
    if (!imageUri) return imageUrl || null; // Conserver l’image existante si pas de nouvelle image
    const blob = await (await fetch(imageUri)).blob();
    const filename = `exercices/${Date.now()}.jpg`;
    const imgRef = ref(storage, filename);
    await uploadBytes(imgRef, blob);
    return await getDownloadURL(imgRef);
  };

  // 💾 Sauvegarder dans Firestore
  const enregistrer = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Erreur', 'Utilisateur non connecté.');
        return;
      }

      const imageUploadedUrl = await uploaderImage();

      const nouvelExercice = {
        nom,
        type,
        muscle,
        auteur: user.uid,
        public: true,
        imageUrl: imageUploadedUrl || '' // sauvegarder le champ imageUrl
      };

      if (id) {
        await updateDoc(doc(db, 'exercices', id), nouvelExercice);
        Alert.alert('Succès', "Exercice mis à jour !");
      } else {
        await addDoc(collection(db, 'exercices'), nouvelExercice);
        Alert.alert('Succès', "Exercice ajouté !");
      }

      navigation.goBack();
    } catch (err) {
      console.error('Erreur sauvegarde exercice:', err);
      Alert.alert('Erreur', err.message || "Problème lors de l'enregistrement.");
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

      <TouchableOpacity style={styles.uploadButton} onPress={choisirImage}>
        <Text style={styles.uploadButtonText}>Sélectionner une image</Text>
      </TouchableOpacity>

      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.previewImage} />
      ) : imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.previewImage} />
      ) : null}

      <TouchableOpacity style={styles.saveButton} onPress={enregistrer}>
        <Text style={styles.saveButtonText}>Sauvegarder</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  formContainer: { padding: 20, backgroundColor: '#1e1e1e', flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backButton: { marginRight: 10 },
  backText: { fontSize: 26, color: '#fff' },
  title: { fontSize: 20, color: '#fff', fontWeight: 'bold' },
  label: { color: '#00aaff', marginTop: 10 },
  input: { backgroundColor: '#2a2a2a', color: '#fff', padding: 10, borderRadius: 8, marginBottom: 10 },
  uploadButton: { backgroundColor: '#007ACC', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  uploadButtonText: { color: '#fff' },
  previewImage: { width: 200, height: 200, borderRadius: 10, marginVertical: 10, alignSelf: 'center' },
  saveButton: { backgroundColor: '#007ACC', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  saveButtonText: { color: '#fff', fontWeight: 'bold' }
});
