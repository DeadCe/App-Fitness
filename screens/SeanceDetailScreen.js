import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const toJSDate = (v) => (v?.toDate ? v.toDate() : new Date(v));
const fmtDate = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

export default function SeanceDetailScreen({ route, navigation }) {
  const { seanceId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [seance, setSeance] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const db = getFirestore();
        const snap = await getDoc(doc(db, 'historiqueSeances', seanceId));
        if (snap.exists()) setSeance({ id: snap.id, ...snap.data() });
      } finally {
        setLoading(false);
      }
    })();
  }, [seanceId]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#00aaff" size="large" /></View>;
  }
  if (!seance) {
    return <View style={styles.center}><Text style={{ color:'#fff' }}>Séance introuvable</Text></View>;
  }

  const d = seance.date ? toJSDate(seance.date) : (seance.createdAt ? toJSDate(seance.createdAt) : null);
  const exercices = Array.isArray(seance.exercices) ? seance.exercices : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity onPress={() => navigation.goBack()}><Text style={{ color:'#fff', fontSize:20 }}>←</Text></TouchableOpacity>
      <Text style={styles.title}>Détail de la séance</Text>
      <Text style={{ color:'#00aaff', marginBottom: 12 }}>{d ? fmtDate(d) : '—'}</Text>

      {exercices.length === 0 ? (
        <Text style={{ color:'#aaa' }}>Aucun exercice</Text>
      ) : exercices.map((ex, idx) => {
        const nom = ex.nomExercice || ex.nom || 'Exercice';
        const series =
          (Array.isArray(ex.series) && ex.series) ||
          (ex.performances?.series && Array.isArray(ex.performances.series) && ex.performances.series) ||
          (Array.isArray(ex.sets) && ex.sets) ||
          [];
        return (
          <View key={idx} style={styles.card}>
            <Text style={styles.exo}>{nom}</Text>
            {series.length === 0 ? (
              <Text style={{ color:'#aaa' }}>Aucune série</Text>
            ) : series.map((s, i) => (
              <Text key={i} style={styles.ser}>
                Série {i+1} : {s.poids ?? '—'} kg × {s.repetitions ?? s.reps ?? '—'} reps
              </Text>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex:1, backgroundColor:'#1e1e1e' },
  center: { flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#1e1e1e' },
  title: { color:'#fff', fontWeight:'bold', fontSize:20, marginTop:8, marginBottom:4 },
  card: { backgroundColor:'#252525', borderRadius:12, padding:12, marginBottom:10, borderWidth:1, borderColor:'#333' },
  exo: { color:'#00aaff', fontWeight:'bold', marginBottom:6 },
  ser: { color:'#fff' },
});
