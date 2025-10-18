// screens/PerformanceScreen.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ScrollView, ActivityIndicator, Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';

const screenWidth = Dimensions.get('window').width;

// Helpers timestamp → Date
const toJSDate = (v) => {
  if (!v) return null;
  if (v?.toDate) {
    try { return v.toDate(); } catch { /* noop */ }
  }
  try { return new Date(v); } catch { return null; }
};

// Calcule points = poids max par séance pour l'exo
function computeMaxWeightPoints(entries) {
  // entries: [{date: Date, series:[{poids, repetitions}]}]
  const points = entries.map((e) => {
    const sets = Array.isArray(e.series) ? e.series : [];
    const max = sets.reduce((m, s) => {
      const w = Number(s?.poids) || 0;
      return w > m ? w : m;
    }, 0);
    return { date: e.date, value: max };
  })
  .filter(p => p.value > 0); // on ignore les séances sans poids

  // Trie chrono asc
  points.sort((a, b) => a.date - b.date);
  return points;
}

export default function PerformanceScreen() {
  const [loading, setLoading] = useState(false);
  const [exercises, setExercises] = useState([]);        // {id, nom}
  const [search, setSearch] = useState('');
  const [selectedExo, setSelectedExo] = useState(null);  // {id, nom}
  const [favorites, setFavorites] = useState([]);        // [{id, nom}]
  const [seriesData, setSeriesData] = useState([]);      // [{date, value}]

  const user = auth.currentUser;
  const favKey = useMemo(() => `perf:favorites:${user?.uid || 'anon'}`, [user?.uid]);

  // Charger la liste des exercices + favoris
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        setLoading(true);

        const exosSnap = await getDocs(collection(db, 'exercices'));
        const list = exosSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(x => x?.nom)
          .map(x => ({ id: x.id, nom: x.nom }));

        if (!mounted) return;
        setExercises(list);

        // favorites
        try {
          const raw = await AsyncStorage.getItem(favKey);
          const fav = raw ? JSON.parse(raw) : [];
          if (Array.isArray(fav)) setFavorites(fav);
        } catch { /* noop */ }
      } catch (e) {
        console.error(e);
        Alert.alert('Erreur', "Impossible de charger les exercices.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => { mounted = false; };
  }, [favKey]);

  // Charger l’historique quand on choisit un exo (poids max par séance)
  const loadHistoryForExercise = useCallback(async (exo) => {
    if (!user || !exo) return;
    setLoading(true);
    try {
      // On charge toutes les séances de l’utilisateur
      const qHist = query(collection(db, 'historiqueSeances'), where('utilisateurId', '==', user.uid));
      const snap = await getDocs(qHist);
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // On normalise et on extrait les sets pour l’exercice choisi
      const matched = [];
      for (const r of rows) {
        const d = toJSDate(r.date);
        if (!d) continue;

        const exercices = Array.isArray(r.exercices) ? r.exercices : [];
        const exoItem = exercices.find(e =>
          (e.idExercice && e.idExercice === exo.id) ||
          (e.id && e.id === exo.id) ||
          (e.nom && e.nom === exo.nom) ||
          (e.nomExercice && e.nomExercice === exo.nom)
        );
        if (!exoItem) continue;

        // différentes structures possibles
        const series =
          (Array.isArray(exoItem.series) && exoItem.series) ||
          (exoItem.performances?.series && Array.isArray(exoItem.performances.series) && exoItem.performances.series) ||
          (Array.isArray(exoItem.sets) && exoItem.sets) ||
          [];

        matched.push({ date: d, series });
      }

      const pts = computeMaxWeightPoints(matched);
      setSeriesData(pts);
    } catch (e) {
      console.error(e);
      Alert.alert('Erreur', "Impossible de charger l'historique.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Recharger la série quand exo change
  useEffect(() => {
    if (selectedExo) loadHistoryForExercise(selectedExo);
    else setSeriesData([]);
  }, [selectedExo, loadHistoryForExercise]);

  // UI: liste filtrée
  const filteredExercises = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return exercises.slice(0, 50);
    return exercises.filter(e => e.nom?.toLowerCase().includes(q)).slice(0, 50);
  }, [exercises, search]);

  // Favoris
  const toggleFavorite = async (exo) => {
    const exists = favorites.find(f => f.id === exo.id);
    let next;
    if (exists) next = favorites.filter(f => f.id !== exo.id);
    else next = [{ id: exo.id, nom: exo.nom }, ...favorites];
    setFavorites(next);
    try { await AsyncStorage.setItem(favKey, JSON.stringify(next)); } catch {}
  };

  // Préparer données chart
  const labels = seriesData.map(p =>
    `${p.date.getDate().toString().padStart(2, '0')}/${(p.date.getMonth()+1).toString().padStart(2, '0')}`
  );
  const values = seriesData.map(p => Number(p.value?.toFixed(2)));
  const chartData = {
    labels: labels.length ? labels : [' '],
    datasets: [{ data: values.length ? values : [0] }]
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Performance</Text>

      {/* Favoris */}
      {favorites.length > 0 && (
        <View style={styles.favRow}>
          <Text style={styles.sectionTitle}>Favoris</Text>
          <View style={styles.favChips}>
            {favorites.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[styles.chip, selectedExo?.id === f.id && styles.chipActive]}
                onPress={() => setSelectedExo(f)}
                onLongPress={() => toggleFavorite(f)}
              >
                <Text style={styles.chipText}>{f.nom}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Recherche */}
      <Text style={styles.sectionTitle}>Rechercher un exercice</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex: Développé couché"
        placeholderTextColor="#999"
        value={search}
        onChangeText={setSearch}
      />

      {/* Liste résultats (cliquable) */}
      <FlatList
        data={filteredExercises}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={{ paddingBottom: 6 }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setSelectedExo(item)}>
              <Text style={styles.rowText}>{item.nom}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => toggleFavorite(item)}>
              <Text style={{ color: favorites.some(f => f.id === item.id) ? '#ffd166' : '#00aaff' }}>
                {favorites.some(f => f.id === item.id) ? '★' : '☆'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Graph */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {selectedExo ? `${selectedExo.nom} — Poids max (kg)` : 'Sélectionnez un exercice'}
        </Text>

        {loading ? (
          <ActivityIndicator color="#00aaff" style={{ marginVertical: 20 }} />
        ) : selectedExo ? (
          seriesData.length > 0 ? (
            <LineChart
              data={chartData}
              width={screenWidth - 40}
              height={230}
              chartConfig={{
                backgroundColor: '#1e1e1e',
                backgroundGradientFrom: '#1e1e1e',
                backgroundGradientTo: '#1e1e1e',
                decimalPlaces: 1,
                color: () => '#00aaff',
                labelColor: () => '#fff',
                propsForDots: { r: '3', strokeWidth: '1', stroke: '#fff' },
              }}
              bezier
              style={{ borderRadius: 12, marginTop: 8 }}
            />
          ) : (
            <Text style={{ color: '#aaa', marginTop: 10, fontStyle: 'italic' }}>
              Aucune donnée trouvée pour cet exercice.
            </Text>
          )
        ) : (
          <Text style={{ color: '#aaa', marginTop: 10, fontStyle: 'italic' }}>
            Recherchez et sélectionnez un exercice pour afficher l’évolution.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#1e1e1e', padding: 20 },
  title: { fontSize: 22, color: '#fff', fontWeight: 'bold', marginBottom: 6 },

  favRow: { marginBottom: 10 },
  favChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16,
    backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#333'
  },
  chipActive: { borderColor: '#00aaff' },
  chipText: { color: '#fff' },

  sectionTitle: { color: '#00aaff', fontWeight: 'bold', marginTop: 10, marginBottom: 6 },

  input: {
    backgroundColor: '#2a2a2a', color: '#fff',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#333',
  },

  list: { marginTop: 8, maxHeight: 220, backgroundColor: '#202020', borderRadius: 12 },
  row: {
    paddingVertical: 12, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: '#2b2b2b', flexDirection: 'row', alignItems: 'center'
  },
  rowText: { color: '#fff', fontSize: 15 },

  card: { backgroundColor: '#252525', borderRadius: 14, padding: 14, marginTop: 10 },
  cardTitle: { color: '#fff', fontWeight: '600' },
});
