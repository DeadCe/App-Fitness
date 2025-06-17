import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

const screenWidth = Dimensions.get("window").width;

export default function ModifierUtilisateurScreen({ navigation }) {
  const isFocused = useIsFocused();
  const [utilisateur, setUtilisateur] = useState({});
  const [mesures, setMesures] = useState([]);

  const chargerInfos = async () => {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    console.log("Aucun utilisateur connecté à Firebase.");
    return;
  }

  const q = query(
    collection(db, 'mesures'),
    where('utilisateur', '==', currentUser.uid),
    orderBy('date')
  );

  try {
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setMesures(list);
    console.log("Mesures chargées :", list);
  } catch (error) {
    console.error("Erreur lors du chargement des mesures :", error);
  }
};


  useEffect(() => {
    if (isFocused) {
      chargerInfos();
    }
  }, [isFocused]);

  const sauvegarder = async () => {
    const userStr = await AsyncStorage.getItem('utilisateurConnecté');
    const user = userStr ? JSON.parse(userStr) : {};

    const updatedUser = {
      ...user,
      prenom: utilisateur.prenom || '',
      taille: utilisateur.taille || '',
      anniversaire: utilisateur.anniversaire || ''
    };

    await AsyncStorage.setItem('utilisateurConnecté', JSON.stringify(updatedUser));
    setUtilisateur(updatedUser);
    alert('Profil mis à jour !');
  };

  const derniereMesure = mesures.length > 0 ? mesures[mesures.length - 1] : null;

  const graphData = {
    labels: mesures.map((m, i) => `#${i + 1}`),
    datasets: [
      {
        data: mesures.map(m => parseFloat(m.poids || 0)),
        color: () => 'rgba(255, 255, 255, 1)',
        strokeWidth: 2,
      },
      {
        data: mesures.map(m => parseFloat(m.masseMusculaire || 0)),
        color: () => 'rgba(0, 122, 255, 1)',
        strokeWidth: 2,
      },
      {
        data: mesures.map(m => parseFloat(m.masseGrasse || 0)),
        color: () => 'rgba(255, 99, 132, 1)',
        strokeWidth: 2,
      }
    ],
    legend: ["Poids", "Masse musculaire", "Masse grasse"]
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Mon Profil</Text>

      <Text style={styles.label}>Prénom :</Text>
      <TextInput
        style={styles.input}
        value={utilisateur.prenom}
        onChangeText={(text) => setUtilisateur({ ...utilisateur, prenom: text })}
        placeholder="Prénom"
        placeholderTextColor="#999"
      />

      <Text style={styles.label}>Taille (cm) :</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={utilisateur.taille}
        onChangeText={(text) => setUtilisateur({ ...utilisateur, taille: text })}
        placeholder="Taille"
        placeholderTextColor="#999"
      />

      <Text style={styles.label}>Date de naissance :</Text>
      <TextInput
        style={styles.input}
        value={utilisateur.anniversaire}
        onChangeText={(text) => setUtilisateur({ ...utilisateur, anniversaire: text })}
        placeholder="JJ/MM/AAAA"
        placeholderTextColor="#999"
      />

      <TouchableOpacity style={styles.saveButton} onPress={sauvegarder}>
        <Text style={styles.saveText}>Sauvegarder les infos de base</Text>
      </TouchableOpacity>

      {derniereMesure && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dernière mesure :</Text>
          <Text style={styles.info}>Poids : {derniereMesure.poids || '-'} kg</Text>
          <Text style={styles.info}>Masse grasse : {derniereMesure.masseGrasse || '-'} %</Text>
          <Text style={styles.info}>Masse musculaire : {derniereMesure.masseMusculaire || '-'} %</Text>
        </View>
      )}

      {mesures.length > 1 && (
        <View>
          <Text style={styles.sectionTitle}>Évolution :</Text>
          <LineChart
            data={graphData}
            width={screenWidth - 40}
            height={220}
            chartConfig={{
              backgroundColor: "#1e1e1e",
              backgroundGradientFrom: "#1e1e1e",
              backgroundGradientTo: "#1e1e1e",
              decimalPlaces: 1,
              color: () => `#00aaff`,
              labelColor: () => `#fff`,
              propsForDots: {
                r: "3",
                strokeWidth: "1",
                stroke: "#fff"
              }
            }}
            style={{ marginVertical: 10, borderRadius: 10 }}
          />
        </View>
      )}

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate('AjouterMesure')}
      >
        <Text style={styles.saveText}>Ajouter une mesure</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#1e1e1e' },
  title: { fontSize: 24, color: '#fff', fontWeight: 'bold', marginBottom: 20 },
  label: { color: '#aaa', marginTop: 15 },
  input: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
    padding: 10,
    borderRadius: 6,
    marginBottom: 10
  },
  saveButton: {
    backgroundColor: '#00aaff',
    padding: 12,
    marginTop: 10,
    borderRadius: 6,
    alignItems: 'center'
  },
  saveText: { color: '#fff', fontWeight: 'bold' },
  section: { marginTop: 30 },
  sectionTitle: { color: '#00aaff', fontSize: 18, marginBottom: 5 },
  info: { color: '#fff', marginBottom: 4 },
  addButton: {
    backgroundColor: '#007ACC',
    padding: 12,
    marginTop: 30,
    borderRadius: 6,
    alignItems: 'center'
  }
});
