import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

export default function RecapitulatifSeanceScreen({ route, navigation }) {
  const { nouvelleEntree } = route.params || {};

  if (!nouvelleEntree) {
    return (
      <View style={styles.container}>
        <Text style={styles.detail}>Aucune séance à afficher.</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { date, seance, exercices } = nouvelleEntree;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Récapitulatif de la séance</Text>
      </View>

      <Text style={styles.detail}>Date : {new Date(date).toLocaleString()}</Text>
      <Text style={styles.detail}>Séance : {seance}</Text>

      {exercices && exercices.length > 0 ? (
        exercices.map((exo, i) => (
          <View key={i} style={styles.card}>
            <Text style={styles.userName}>{exo.nom || 'Exercice sans nom'}</Text>
            {exo.performances?.series && exo.performances.series.length > 0 ? (
              exo.performances.series.map((serie, j) => (
                <Text key={j} style={styles.series}>
                  Série {j + 1} : {serie.poids} kg × {serie.repetitions} rép
                </Text>
              ))
            ) : (
              <Text style={{ color: '#aaa' }}>Aucune série enregistrée</Text>
            )}
          </View>
        ))
      ) : (
        <Text style={styles.detail}>Aucun exercice dans cette séance</Text>
      )}

      <TouchableOpacity
        style={styles.button}
        onPress={() =>
          navigation.reset({
            index: 0,
            routes: [
              {
                name: 'Root',
                state: { index: 0, routes: [{ name: 'Accueil' }] },
              },
            ],
          })
        }
      >
        <Text style={styles.buttonText}>Retour à l'accueil</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e1e1e',
    padding: 20,
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    marginBottom: 10,
    position: 'relative',
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
  backText: { fontSize: 26, color: '#fff' },
  headerTitle: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  detail: {
    color: '#ccc',
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#2a2a2a',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  userName: {
    fontSize: 18,
    color: '#00aaff',
    fontWeight: 'bold',
    marginBottom: 5,
  },
  series: {
    color: '#fff',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#007ACC',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});
