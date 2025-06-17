import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';

export default function ListeSeancesScreen({ navigation }) {
  const [seances, setSeances] = useState([]);
  const [afficherPubliques, setAfficherPubliques] = useState(false);
  const [utilisateur, setUtilisateur] = useState(null);

  useEffect(() => {
    const charger = async () => {
      try {
        const utilisateurActuel = auth.currentUser;
        if (!utilisateurActuel || !utilisateurActuel.uid) {
          Alert.alert("Erreur", "Utilisateur non connecté.");
          return;
        }

        setUtilisateur(utilisateurActuel);

        const snapshot = await getDocs(collection(db, "seances"));
        const toutes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setSeances(toutes);
      } catch (err) {
        console.error("Erreur Firestore :", err);
        Alert.alert("Erreur", err.message || "Impossible de charger les séances.");
      }
    };

    const unsubscribe = navigation.addListener('focus', charger);
    return unsubscribe;
  }, [navigation]);

  const nomUtilisateur = utilisateur?.uid;

  const seancesFiltrees = seances.filter((s) => {
    if (!nomUtilisateur) return false;
    if (afficherPubliques) {
      return s.public === true && s.auteur !== nomUtilisateur;
    } else {
      return s.auteur === nomUtilisateur;
    }
  });

  return (
    <View style={styles.container}>
      {/* En-tête */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={{ fontSize: 26, color: '#fff' }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {afficherPubliques ? 'Séances publiques' : 'Mes séances'}
        </Text>
      </View>

      {/* Toggle */}
      <TouchableOpacity
        style={styles.toggleButton}
        onPress={() => setAfficherPubliques(prev => !prev)}
      >
        <Text style={styles.buttonText}>
          {afficherPubliques ? '← Revenir à mes séances' : 'Voir les séances publiques'}
        </Text>
      </TouchableOpacity>

      {/* Liste */}
      <FlatList
        data={seancesFiltrees}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => {
          const estAuteur = item.auteur === nomUtilisateur;

          return (
            <TouchableOpacity
              style={styles.carteCarree}
              onPress={() => {
                if (estAuteur) {
                  navigation.navigate('AjouterSeance', { index: seances.findIndex(s => s.id === item.id) });
                } else {
                  navigation.navigate('ConsulterSeance', { index: seances.findIndex(s => s.id === item.id) });
                }
              }}
            >
              <Text style={styles.buttonText}>
                {item.nom}
                {!estAuteur ? ' 🔒' : ''}
              </Text>
              {afficherPubliques && item.auteur && (
                <Text style={styles.publicLabel}>par {item.auteur}</Text>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {!afficherPubliques && (
        <TouchableOpacity
          style={styles.bulleButton}
          onPress={() => navigation.navigate('AjouterSeance', { index: -1 })}
        >
          <Text style={styles.buttonText}>Ajouter une séance</Text>
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
    zIndex: 10,
  },
  title: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center'
  },
  toggleButton: {
    backgroundColor: '#00384D',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center'
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  carteCarree: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    width: '48%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10
  },
  bulleButton: {
    backgroundColor: '#2e2e2e',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#ffffff',
    paddingVertical: 15,
    paddingHorizontal: 30,
    marginTop: 20,
    alignItems: 'center'
  },
  buttonText: {
    color: '#00aaff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  publicLabel: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center'
  }
});
