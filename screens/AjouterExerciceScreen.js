import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Image } from 'react-native';
import { collection, addDoc, updateDoc, doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { Picker } from '@react-native-picker/picker';

export default function AjouterExerciceScreen({ route, navigation }) {
  const { id } = route.params || {};
  const [nom, setNom] = useState('');
  const [type, setType] = useState('');
  const [muscle, setMuscle] = useState('');
  const [imageFile, setImageFile] = useState(null); // Fichier image
  const [imageUri, setImageUri] = useState(null);   // Pour l'aperçu
  const [imageUrl, setImageUrl] = useState(null);   // URL Firestore existante
  const [chargement, setChargement] = useState(true);

  const fileInputRef = useRef(null);

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
            setImageUrl(data.imageUrl || null);
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

  const choisirImage = () => {
    fileInputRef.current.click();
  };

  const handleFileSelected = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);             // Stocke le fichier
      setImageUri(URL.createObjectURL(file)); // Aperçu local
    }
  };

  const uploaderImage = async () => {
    if (!imageFile) return imageUrl || null;
    const filename = `exercices/${Date.now()}-${imageFile.name}`;
    const imgRef = ref(storage, filename);
    await uploadBytes(imgRef, imageFile); // Envoi sur Firebase
    return await getDownloadURL(imgRef);  // Récupère l'URL publique
  };

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
        imageUrl: imageUploadedUrl || '',
      };

      if (id) {
        await updateDoc(doc(db, 'exercices', id), nouvelExercice);
        Alert.alert('Succès', 'Exercice mis à jour !');
      } else {
        await addDoc(collection(db, 'exercices'), nouvelExercice);
        Alert.alert('Succès', 'Exercice ajouté !');
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
      <TextInput
        style={styles.input}
        value={nom}
        onChangeText={setNom}
        placeholder="Nom"
        placeholderTextColor="#aaa"
      />

      <Text style={styles.label}>Type</Text>
      <TextInput
        style={styles.input}
        value={type}
        onChangeText={setType}
        placeholder="Type"
        placeholderTextColor="#aaa"
      />

      <Text style={styles.label}>Muscle ciblé</Text>
<View style={styles.pickerContainer}>
  <Picker
    selectedValue={muscle}
    onValueChange={(itemValue) => setMuscle(itemValue)}
    style={styles.picker}
    dropdownIconColor="#fff"
  >
    <Picker.Item label="Choisir un muscle..." value="" color="#888" />
    <Picker.Item label="Pectoraux (pecs)" value="Pectoraux" />
    <Picker.Item label="Dos (lats, trapèzes)" value="Dos" />
    <Picker.Item label="Épaules (deltoïdes)" value="Épaules" />
    <Picker.Item label="Biceps" value="Biceps" />
    <Picker.Item label="Triceps" value="Triceps" />
    <Picker.Item label="Quadriceps (quads)" value="Quadriceps" />
    <Picker.Item label="Ischio-jambiers (ischios)" value="Ischio-jambiers" />
    <Picker.Item label="Mollets" value="Mollets" />
    <Picker.Item label="Abdominaux (abdos)" value="Abdominaux" />
    <Picker.Item label="Fessiers (fesses)" value="Fessiers" />
  </Picker>
</View>


      <TouchableOpacity style={styles.uploadButton} onPress={choisirImage}>
        <Text style={styles.uploadButtonText}>Sélectionner une image</Text>
      </TouchableOpacity>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />

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
  saveButtonText: { color: '#fff', fontWeight: 'bold' },
  pickerContainer: { backgroundColor: '#2a2a2a', borderRadius: 8, marginBottom: 10, overflow: 'hidden', },
  picker: { color: '#fff', backgroundColor: '#2a2a2a', }

});
