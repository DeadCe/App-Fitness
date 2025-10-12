import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, TextInput, Platform
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getAuth } from 'firebase/auth';
import {
  getFirestore, collection, query, where, orderBy, limit, getDocs, startAfter
} from 'firebase/firestore';

const toJSDate = (v) => (v?.toDate ? v.toDate() : new Date(v));
const fmtDate = (d) => {
  if (!d || Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${dd}/${mm}/${yyyy} • ${hh}:${mi}`;
};
const compactSeries = (seriesArr = []) =>
  seriesArr
    .map((s) => {
      const p = s?.poids ?? s?.weight ?? s?.kg ?? null;
      const r = s?.repetitions ?? s?.reps ?? null;
      if (p == null && r == null) return null;
      return `${p ?? '—'}x${r ?? '—'}`;
    })
    .filter(Boolean)
    .join(', ');

export default function HistoriqueSeancesScreen() {
  const nav = useNavigation();
  const auth = getAuth();
  const db = getFirestore();

  // données
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // pagination
  const PAGE_SIZE = 20;
  const [canPaginate, setCanPaginate] = useState(true); // false si fallback
  const [isPaginating, setIsPaginating] = useState(false);
  const lastDocRef = useRef(null);

  // filtres
  const [search, setSearch] = useState('');           // texte sur nom d’exo
  const [onlyThisMonth, setOnlyThisMonth] = useState(false);
  const [exercises, setExercises] = useState([]);     // [{id, nom}]
  const [selectedExerciseId, setSelectedExerciseId] = useState(''); // '' = tous

  // dates
  const startOfMonth = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d;
  }, []);

  // util
  const normalizeRow = (r) => {
    const d = r.date ? toJSDate(r.date) : (r.createdAt ? toJSDate(r.createdAt) : null);
    const exercices = Array.isArray(r.exercices) ? r.exercices : [];
    return { id: r.id, date: d, exercices, _raw: r };
  };

  // charge la liste d’exercices pour le Picker
  const loadExercises = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'exercices'));
      const list = snap.docs.map(d => ({ id: d.id, nom: d.data()?.nom || d.data()?.name || 'Sans nom' }))
                            .sort((a,b) => a.nom.localeCompare(b.nom));
      setExercises(list);
    } catch (e) {
      console.warn('Impossible de charger la liste des exercices :', e);
    }
  }, [db]);

  // charge la première page
  const loadFirst = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setLoading(true);
    lastDocRef.current = null;

    try {
      // tentative: ordre Firestore (permet le scroll infini)
      const q1 = query(
        collection(db, 'historiqueSeances'),
        where('utilisateurId', '==', user.uid),
        orderBy('date', 'desc'),
        limit(PAGE_SIZE)
      );
      const snap1 = await getDocs(q1);

      const docs = snap1.docs.map(d => ({ id: d.id, ...d.data(), __doc: d }));
      lastDocRef.current = snap1.docs.length ? snap1.docs[snap1.docs.length - 1] : null;
      setItems(docs.map(normalizeRow));
      setCanPaginate(true); // ok, on peut paginer
    } catch {
      // fallback : pas d'orderBy possible -> on charge un gros lot et on trie côté client
      const q2 = query(
        collection(db, 'historiqueSeances'),
        where('utilisateurId', '==', auth.currentUser.uid),
        limit(200)
      );
      const snap2 = await getDocs(q2);
      let rows = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      rows = rows
        .map(r => ({ ...r, _d: r.date ? toJSDate(r.date) : (r.createdAt ? toJSDate(r.createdAt) : null) }))
        .filter(r => r._d && !Number.isNaN(r._d))
        .sort((a,b) => b._d - a._d);

      setItems(rows.map(normalizeRow));
      setCanPaginate(false); // pas de pagination dans ce mode
      lastDocRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [auth, db]);

  // page suivante
  const loadMore = useCallback(async () => {
    if (!canPaginate || isPaginating || !lastDocRef.current) return;
    setIsPaginating(true);
    try {
      const user = auth.currentUser;
      if (!user) return;

      const qMore = query(
        collection(db, 'historiqueSeances'),
        where('utilisateurId', '==', user.uid),
        orderBy('date', 'desc'),
        startAfter(lastDocRef.current),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(qMore);
      if (snap.empty) {
        lastDocRef.current = null;
        return;
      }
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data(), __doc: d }));
      lastDocRef.current = snap.docs[snap.docs.length - 1];
      setItems(prev => [...prev, ...docs.map(normalizeRow)]);
    } finally {
      setIsPaginating(false);
    }
  }, [auth, db, canPaginate, isPaginating]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadExercises(), loadFirst()]);
    setRefreshing(false);
  }, [loadExercises, loadFirst]);

  // chargement initial
  useFocusEffect(useCallback(() => { onRefresh(); }, [onRefresh]));

  // filtration côté client
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter(it => {
      // filtre période
      if (onlyThisMonth && it.date && it.date < startOfMonth) return false;

      // filtre par exercice (id)
      if (selectedExerciseId) {
        const hasExId = (it.exercices || []).some(ex =>
          ex.idExercice === selectedExerciseId ||
          ex.id === selectedExerciseId
        );
        if (!hasExId) return false;
      }

      // filtre texte sur nom d’exo
      if (!term) return true;
      const hasTerm = (it.exercices || []).some(ex => {
        const name = (ex.nomExercice || ex.nom || ex.name || '').toLowerCase();
        return name.includes(term);
      });
      return hasTerm;
    });
  }, [items, search, onlyThisMonth, startOfMonth, selectedExerciseId]);

  const renderItem = ({ item }) => {
    const totalSeries = item.exercices.reduce((acc, ex) => {
      const s =
        (Array.isArray(ex.series) && ex.series) ||
        (ex.performances?.series && Array.isArray(ex.performances.series) && ex.performances.series) ||
        (Array.isArray(ex.sets) && ex.sets) ||
        [];
      return acc + s.length;
    }, 0);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => nav.navigate('SeanceDetail', { seanceId: item.id })}
        activeOpacity={0.8}
      >
        <Text style={styles.date}>{fmtDate(item.date)}</Text>

        {item.exercices.length === 0 ? (
          <Text style={styles.emptyEx}>Aucun exercice</Text>
        ) : (
          item.exercices.slice(0, 4).map((ex, i) => {
            const nom = ex.nomExercice || ex.nom || ex.name || 'Exercice';
            const series =
              (Array.isArray(ex.series) && ex.series) ||
              (ex.performances?.series && Array.isArray(ex.performances.series) && ex.performances.series) ||
              (Array.isArray(ex.sets) && ex.sets) ||
              [];
            return (
              <View key={i} style={styles.row}>
                <Text style={styles.exo}>{nom}</Text>
                <Text style={styles.series}>{compactSeries(series)}</Text>
              </View>
            );
          })
        )}

        {item.exercices.length > 4 && (
          <Text style={styles.more}>+ {item.exercices.length - 4} autres exercices</Text>
        )}

        <View style={styles.metaRow}>
          <Text style={styles.meta}>{item.exercices.length} exos</Text>
          <Text style={styles.meta}>•</Text>
          <Text style={styles.meta}>{totalSeries} séries</Text>
          <Text style={styles.link}>   Voir le détail →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Historique des séances</Text>

      {/* Filtres */}
      <View style={styles.filters}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un exercice..."
          placeholderTextColor="#888"
          style={styles.search}
        />
        <TouchableOpacity
          onPress={() => setOnlyThisMonth(v => !v)}
          style={[styles.tag, onlyThisMonth && styles.tagOn]}
        >
          <Text style={{ color: onlyThisMonth ? '#001' : '#ccc' }}>
            Mois en cours
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filtre par exercice */}
      <View style={styles.pickerRow}>
        <Text style={{ color:'#aaa', marginRight: 8 }}>Exercice :</Text>
        <View style={styles.pickerWrap}>
          <Picker
            selectedValue={selectedExerciseId}
            onValueChange={(val) => setSelectedExerciseId(val)}
            dropdownIconColor="#00aaff"
            style={{ color:'#fff' }}
          >
            <Picker.Item label="Tous" value="" />
            {exercises.map(ex => (
              <Picker.Item key={ex.id} label={ex.nom} value={ex.id} />
            ))}
          </Picker>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#00aaff" size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00aaff" />
          }
          onEndReachedThreshold={0.5}
          onEndReached={loadMore}
          ListFooterComponent={
            canPaginate && isPaginating ? (
              <View style={{ paddingVertical: 12 }}>
                <ActivityIndicator color="#00aaff" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <Text style={{ color: '#aaa', textAlign: 'center', marginTop: 30 }}>
              Aucune séance enregistrée
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1e1e1e', paddingHorizontal: 16, paddingTop: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },

  filters: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  search: {
    flex: 1, backgroundColor: '#252525', color: '#fff', paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderRadius: 10, marginRight: 8, borderColor: '#333', borderWidth: 1
  },
  tag: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#555'
  },
  tagOn: { backgroundColor: '#00aaff' },

  pickerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  pickerWrap: { flex: 1, backgroundColor:'#252525', borderRadius:10, borderWidth:1, borderColor:'#333' },

  card: {
    backgroundColor: '#252525',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1, borderColor: '#333'
  },
  date: { color: '#00aaff', fontWeight: 'bold', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  exo: { color: '#fff', flexShrink: 1, paddingRight: 8 },
  series: { color: '#ccc', fontSize: 12 },
  more: { color: '#aaa', fontStyle: 'italic', marginTop: 6 },
  metaRow: { flexDirection: 'row', marginTop: 10, alignItems: 'center' },
  meta: { color: '#aaa' },
  link: { color: '#00aaff', fontWeight: '600' },
  emptyEx: { color: '#aaa', fontStyle: 'italic' },
});
