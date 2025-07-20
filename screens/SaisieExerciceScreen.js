import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput } from 'react-native';
import { getFirestore, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export default function SaisieExerciceScreen({ route, navigation }) {
  const { indexExercice, utilisateursChoisis = [], onSave, idExercice } = route.params || {};

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Si pas d'utilisateur transmis, affiche un message propre :
  if (!utilisateursChoisis || utilisateursChoisis.length === 0) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: "#1e1e1e"}}>
        <Text style={{ color: 'white' }}>Aucun utilisateur sélectionné</Text>
      </View>
    );
  }

  useEffect(() => {
    const chargerDernierePerf = async () => {
      const db = getFirestore();
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user || !idExercice) {
        // Fallback sans données
        setData(utilisateursChoisis.map(() => [{ poids: 0, repetitions: 8 }]));
        setLoading(false);
        return;
      }

      try {
        const q = query(
          collection(db, 'historiqueSeances'),
          where('utilisateurId', '==', user.uid),
          where('idExercice', '==', idExercice),
          orderBy('date', 'desc'),
          limit(1)
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const doc = snapshot.docs[0].data();
          const series = doc.series || [{ poids: 0, repetitions: 8 }];
          setData(utilisateursChoisis.map(() => [...series]));
        } else {
          setData(utilisateursChoisis.map(() => [{ poids: 0, repetitions: 8 }]));
        }
      } catch (e) {
        console.log('Erreur chargement performance précédente', e);
        setData(utilisateursChoisis.map(() => [{ poids: 0, repetitions: 8 }]));
      } finally {
        setLoading(false);
      }
    };

    chargerDernierePerf();
  }, []);

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
    if (onSave) onSave(performances[0]);
    navigation.goBack();
  };

  if (loading) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: "#1e1e1e"}}>
        <Text style={{ color: 'white' }}>Chargement des données...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 60,
        marginBottom: 10,
        position: 'relative'
      }}>
        <TouchableOpacity
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 50,
            height: 50,
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10,
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => navigation.goBack()}
        >
          <Text style={{ fontSize: 26, color: '#fff', marginBottom: 2 }}>←</Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 20, color: '#fff', fontWeight: 'bold', flex: 1, textAlign: 'center' }}>
          Saisie des performances
        </Text>
      </View>
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
  title: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 20
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
