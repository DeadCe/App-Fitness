import React, { useState, useEffect } from 'react';
import { SafeAreaView, Text, View, TouchableOpacity, StyleSheet, ScrollView, Modal, FlatList, Alert } from 'react-native';
import { collection, doc, deleteDoc,  getDoc, getDocs, setDoc, query, where, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import {getAuth } from 'firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

export default function AccueilScreen({ navigation }) {
  const [utilisateur, setUtilisateur] = useState(null);
  const [derniereSeance, setDerniereSeance] = useState(null);
  const [dernierPoids, setDernierPoids] = useState(null);
  const [planning, setPlanning] = useState({
    Lun: [], Mar: [], Mer: [], Jeu: [], Ven: [], Sam: [], Dim: []
  });
  const [modalVisible, setModalVisible] = useState(false);
  const [jourSelectionne, setJourSelectionne] = useState(null);
  const [seancesDisponibles, setSeancesDisponibles] = useState([]);

  useFocusEffect(
  useCallback(() => {
    const charger = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const docSnap = await getDoc(doc(db, "utilisateurs", user.uid));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUtilisateur({ id: user.uid, ...data });
        setDernierPoids(data.poids || null);
      }

      const perfSnap = await getDocs(
        query(collection(db, "performances"), where("utilisateurId", "==", user.uid))
      );
      const perfList = perfSnap.docs.map(d => d.data()).sort((a, b) => new Date(b.date) - new Date(a.date));
      setDerniereSeance(perfList[0] || null);

      const planningSnap = await getDocs(
        query(collection(db, "planning"), where("utilisateurId", "==", user.uid))
      );

      const seancesSnap = await getDocs(collection(db, "seances"));
      const mapSeances = {};
      seancesSnap.forEach(doc => {
        mapSeances[doc.id] = doc.data().nom;
      });

      const p = { Lun: [], Mar: [], Mer: [], Jeu: [], Ven: [], Sam: [], Dim: [] };

      planningSnap.forEach(doc => {
        const d = doc.data();
        if (p[d.jour]) {
          const nomSeance = mapSeances[d.idSeance] || d.nom || 'Séance';
          p[d.jour].push({
            id: doc.id,
            idSeance: d.idSeance,
            nom: nomSeance,
          });
        }
      });

      setPlanning(p);
    };

    charger();
  }, [])
);


  const ouvrirAjoutSeance = async (jour) => {
    const snapshot = await getDocs(collection(db, "seances"));
    const liste = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    setSeancesDisponibles(liste);
    setJourSelectionne(jour);
    setModalVisible(true);
  };

  const ajouterSeanceAuJour = async (idSeance) => {
  console.log("Ajout de la séance :", idSeance); // DEBUG
  if (!jourSelectionne) return;

  const nvPlanning = { ...planning };
  if (!nvPlanning[jourSelectionne]) nvPlanning[jourSelectionne] = [];
  const seance = seancesDisponibles.find(s => s.id === idSeance);
if (!seance) return;
nvPlanning[jourSelectionne].push({ id: seance.id, nom: seance.nom });


  setPlanning(nvPlanning);

  // Mise à plat et sauvegarde
  const planningAPlat = Object.entries(nvPlanning).flatMap(([jour, seances]) =>
    seances.map(seance => ({ jour, idSeance: seance.id, repetition: 'semaine' }))
  );
  setModalVisible(false);
};

  const supprimerSeanceJour = async (jour, idx) => {
  const cible = planning[jour][idx];
  if (!cible?.id) return;

  await deleteDoc(doc(db, "planning", cible.id));

  const nouveau = { ...planning };
  nouveau[jour].splice(idx, 1);
  setPlanning(nouveau);
};

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {utilisateur && (
          <Text style={styles.bienvenue}>Bienvenue {utilisateur.identifiant}</Text>
        )}

        {/* Dernière séance */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dernière séance</Text>
          {derniereSeance ? (
            <>
              <Text style={styles.cardText}>{derniereSeance.nom || 'Nom non défini'}</Text>
              <Text style={styles.cardSubText}>
                {new Date(derniereSeance.date).toLocaleString()}
              </Text>
            </>
          ) : (
            <Text style={styles.cardText}>Aucune séance enregistrée</Text>
          )}
        </View>

        {/* Planning */}
        <View style={styles.card}>
  <Text style={styles.cardTitle}>Planning de la semaine</Text>
  {[
    ['Lun', 'Mar', 'Mer', 'Jeu'],
    ['Ven', 'Sam', 'Dim']
  ].map((ligne, ligneIndex) => (
    <View key={ligneIndex} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
      {ligne.map(jour => (
        <View key={jour} style={{ alignItems: 'center', width: 48 }}>
          <Text style={{ color: '#00aaff', fontWeight: 'bold' }}>{jour}</Text>
          {(planning[jour] || []).map((seance, idx) => (
            <TouchableOpacity
              key={idx}
              style={{
                marginTop: 4,
                backgroundColor: '#00384D',
                borderRadius: 8,
                padding: 4,
                minWidth: 36,
                minHeight: 32,
                justifyContent: 'center',
                alignItems: 'center'
              }}
              onPress={() =>
                navigation.navigate("LancerSeanceScreen", { idSeance: seance.idSeance })
              }
              onLongPress={() => supprimerSeanceJour(jour, idx)}
            >
              <Text style={{ color: '#fff', fontSize: 12 }}>
                {seance.nom || 'Séance'}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => ouvrirAjoutSeance(jour)}
            style={{
              marginTop: 2,
              backgroundColor: '#005f91',
              borderRadius: 8,
              padding: 2,
              minWidth: 24,
              minHeight: 24,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>+</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  ))}
</View>


        {/* Dernier poids */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dernier poids</Text>
          {dernierPoids ? (
            <Text style={styles.cardText}>{dernierPoids} kg</Text>
          ) : (
            <Text style={styles.cardText}>Pas de mesure récente</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.bulleButton}
          onPress={() => navigation.navigate('SeanceFreestyle')}
        >
          <Text style={styles.buttonText}>Démarrer une séance freestyle</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modale ajout séance */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.5)'
        }}>
          <View style={{
            backgroundColor: '#222',
            padding: 18,
            borderRadius: 16,
            width: '80%',
            alignItems: 'center'
          }}>
            <Text style={{ color: '#00aaff', fontSize: 18, marginBottom: 10 }}>Ajouter une séance</Text>
            {seancesDisponibles.length === 0 ? (
              <Text style={{ color: '#fff' }}>Aucune séance créée</Text>
            ) : (
              <FlatList
                data={seancesDisponibles}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
  style={{
    padding: 10,
    backgroundColor: '#00384D',
    marginVertical: 4,
    borderRadius: 8,
    width: '100%'
  }}
  onPress={() => ajouterSeanceAuJour(item.id)}
>
  <Text style={{ color: '#fff', fontSize: 15 }}>{item.nom}</Text>
</TouchableOpacity>

                )}
              />
            )}
            <TouchableOpacity onPress={() => setModalVisible(false)} style={{ marginTop: 16 }}>
              <Text style={{ color: '#fff', fontSize: 16 }}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e1e' },
  scroll: { alignItems: 'center', padding: 20 },
  bienvenue: { fontSize: 22, color: '#ffffff', fontWeight: 'bold', marginBottom: 20 },
  card: {
    backgroundColor: '#252525',
    borderRadius: 20,
    width: '95%',
    padding: 18,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  cardTitle: { color: '#00aaff', fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  cardText: { color: '#fff', fontSize: 16 },
  cardSubText: { color: '#ccc', fontSize: 13, marginTop: 2 },
  bulleButton: {
    backgroundColor: '#232e33',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fff',
    paddingVertical: 18,
    paddingHorizontal: 34,
    marginTop: 18,
    alignItems: 'center'
  },
  buttonText: { color: '#00aaff', fontSize: 16, fontWeight: 'bold' }
});
