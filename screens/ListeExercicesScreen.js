import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export default function ListeExercicesScreen({ navigation, route }) {
  const [exercices, setExercices] = useState([]);
  const [utilisateur, setUtilisateur] = useState(null);
  const [afficherPublics, setAfficherPublics] = useState(false);
  const { onSelect } = route.params || {};

  useEffect(() => {
    const chargerExercices = async () => {
      try {
        const auth = getAuth();
        const utilisateur = auth.currentUser;
        setUtilisateur(utilisateur);

        const snapshot = await getDocs(collection(db, 'exercices'));
        const liste = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setExercices(liste);
      } catch (err) {
        console.error("Erreur chargement exercices :", err);
      }
    };

    const unsubscribe = navigation.addListener('focus', chargerExercices);
    return unsubscribe;
  }, [navigation]);

  const exercicesFiltres = exercices.filter(e => {
    if (!utilisateur) return false;
    return afficherPublics
      ? e.auteur !== utilisateur.uid
      : e.auteur === utilisateur.uid;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={{ fontSize: 26, color: '#fff' }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {afficherPublics ? 'Exercices publics' : 'Mes exercices'}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.toggleButton}
        onPress={() => setAfficherPublics(prev => !prev)}
      >
        <Text style={styles.buttonText}>
          {afficherPublics ? '← Revenir à mes exercices' : 'Voir les exercices publics'}
        </Text>
      </TouchableOpacity>

      <FlatList
        data={exercicesFiltres}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => {
          const estAuteur = item.auteur === utilisateur?.uid;

          return (
            <TouchableOpacity
              style={styles.carteCarree}
              onPress={() => {
                if (onSelect) {
                  onSelect(item.id);
                  navigation.goBack();
                } else if (estAuteur) {
                  navigation.navigate('AjouterExercice', { id: item.id });
                } else {
                  navigation.navigate('ConsulterExercice', { id: item.id });
                }
              }}
            >
              <Text style={styles.buttonText}>
                {item.nom}
                {!onSelect && !estAuteur ? ' 🔒' : ''}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {!afficherPublics && (
        <TouchableOpacity
          style={styles.bulleButton}
          onPress={() => navigation.navigate('AjouterExercice', { id: null })}
        >
          <Text style={styles.buttonText}>Ajouter un exercice</Text>
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
    marginBottom: 20,
    position: 'relative'
  },
  back: {
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
  }
});
