import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput } from 'react-native';
import { getFirestore, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export default function SaisieExerciceScreen({ route, navigation }) {
  const { indexExercice, utilisateursChoisis = [], idExercice } = route.params || {};

  const [data, setData] = useState(utilisateursChoisis.map(() => [{ poids: 0, repetitions: 8 }]));
  const [lastPerf, setLastPerf] = useState(null);
  const auth = getAuth();
  const db = getFirestore();

  // Récupération des dernières perfs
  useEffect(() => {
    const chargerDernieresPerfs = async () => {
      if (!idExercice || !auth.currentUser) return;

      const historiqueRef = collection(db, 'historiqueSeance');
      const q = query(
        historiqueRef,
        where('utilisateurId', '==', auth.currentUser.uid),
        orderBy('date', 'desc'),
        limit(5) // Pour optimiser un peu la recherche
      );
      const snapshot = await getDocs(q);
      for (let doc of snapshot.docs) {
        const data = doc.data();
        const exercice = data.exercices?.find((e) => e.idExercice === idExercice);
        if (exercice?.performances?.series?.length) {
          setLastPerf(exercice.performances.series);
          break;
        }
      }
    };
    chargerDernieresPerfs();
  }, [idExercice]);

  const ajouterSerie = (indexUtilisateur) => {
    const copie = [...data];
    const ref = copie[indexUtilisateur][copie[indexUtilisateur].length - 1];
    copie[indexUtilisateur].push({ poids: ref.poids, repetitions: ref.repetitions });
    setData(copie);
  };

  const modifierValeur = (indexUtilisateur, indexSerie, champ, valeur) => {
    const copie = [...data];
    copie[indexUtilisateur][indexSerie][champ] = parseInt(valeur) || 0;
    setData(copie);
  };

  const valider = () => {
    const performances = utilisateursChoisis.map((u, i) => ({
      utilisateur: u.nom,
      series: data[i],
    }));
    if (route.params?.onSave) route.params.onSave(performances[0]);
    navigation.goBack();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saisie des performances</Text>
      </View>

      {/* Affichage des dernières perfs */}
      {lastPerf && (
        <View style={styles.lastPerfContainer}>
          <Text style={styles.lastPerfTitle}>Dernière performance :</Text>
          {lastPerf.map((serie, index) => (
            <Text key={index} style={styles.lastPerfText}>
              Série {index + 1} : {serie.poids} kg x {serie.repetitions} rép
            </Text>
          ))}
        </View>
      )}

      {utilisateursChoisis.map((utilisateur, i) => (
        <View key={i} style={styles.utilisateurBloc}>
          <Text style={styles.nom}>{utilisateur.nom}</Text>
          {data[i].map((serie, j) => (
            <View key={j} style={styles.serieRow}>
              <Text style={styles.label}>Série {j + 1} :</Text>
              <TextInput
                style={styles.input}
                value={serie.poids.toString()}
                onChangeText={(val) => modifierValeur(i, j, 'poids', val)}
                keyboardType="numeric"
              />
              <Text style={styles.unit}>kg</Text>
              <TextInput
                style={styles.input}
                value={serie.repetitions.toString()}
                onChangeText={(val) => modifierValeur(i, j, 'repetitions', val)}
                keyboardType="numeric"
              />
              <Text style={styles.unit}>rép</Text>
            </View>
          ))}
          <TouchableOpacity onPress={() => ajouterSerie(i)} style={styles.ajouter}>
            <Text style={styles.ajouterText}>+ Ajouter une série</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity onPress={valider} style={styles.button}>
        <Text style={styles.buttonText}>Valider</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e1e1e',
    padding: 20,
    flexGrow: 1
  },
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
  backText: {
    fontSize: 26,
    color: '#fff',
    marginBottom: 2
  },
  headerTitle: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center'
  },
  lastPerfContainer: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 10,
    marginBottom: 15
  },
  lastPerfTitle: {
    color: '#00ccff',
    fontWeight: 'bold',
    marginBottom: 5
  },
  lastPerfText: {
    color: '#fff'
  },
  utilisateurBloc: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20
  },
  nom: {
    color: '#00aaff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10
  },
  serieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  label: {
    color: '#fff',
    marginRight: 10
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 5,
    padding: 5,
    marginHorizontal: 5,
    width: 60,
    textAlign: 'center'
  },
  unit: {
    color: '#ccc',
    marginRight: 10
  },
  ajouter: {
    marginTop: 10,
    alignItems: 'center'
  },
  ajouterText: {
    color: '#00ffcc'
  },
  button: {
    backgroundColor: '#007ACC',
    borderRadius: 10,
    padding: 15,
    marginTop: 10,
    alignItems: 'center'
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold'
  }
});
