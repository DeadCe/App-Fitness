// screens/HistoriqueSeancesScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, TextInput, ScrollView, Platform
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getAuth } from 'firebase/auth';
import {
  getFirestore, collection, query, where, orderBy, limit, getDocs, startAfter
} from 'firebase/firestore';

/* ------------------ utils ------------------ */
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

/* ---------- dropdown custom sombre ---------- */
function ExoDropdown({ value, onChange, options }) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <View style={{ position: 'relative' }}>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        style={styles.ddTrigger}
      >
        <Text style={{ color: '#fff' }}>
          {selected ? selected.label : 'Tous les exercices'}
        </Text>
      </TouchableOpacity>

      {open && (
        <View style={styles.ddMenu}>
          <ScrollView>
            <TouchableOpacity
              onPress={() => { onChange(''); setOpen(false); }}
              style={styles.ddItem}
            >
              <Text style={{ color: '#00aaff' }}>Tous</Text>
            </TouchableOpacity>

            {options.map(opt => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => { onChange(opt.value); setOpen(false); }}
                style={styles.ddItem}
              >
                <Text style={{ color: '#fff' }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

/* -------------- écran historique -------------- */
export default function HistoriqueSeancesScreen() {
  const nav = useNavigation();
  const auth = getAuth();
  const db = getFirestore();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // pagination
  const PAGE_SIZE = 20;
  const lastDocRef = useRef(null);
  const [canPaginate, setCanPaginate] = useState(true);
  const [isPaginating, setIsPaginating] = useState(false);

  // filtres
  const [search, setSearch] = useState('');
  const [onlyThisMonth, setOnlyThisMonth] = useState(false);
  const [exos, setExos] = useState([]);               // {id, nom}
  const [exoSelected, setExoSelected] = useState(''); // id
  const [exoSelectedName, setExoSelectedName] = useState(''); // nom pour fallback

  const startOfMonth = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d;
  }, []);

  const normalizeRow = (r) => {
    const d = r.date ? toJSDate(r.date) : (r.createdAt ? toJSDate(r.createdAt) : null);
    const exercices = Array.isArray(r.exercices) ? r.exercices : [];
    return { id: r.id, date: d, exercices };
  };

  // charger exercices (picker)
  const loadExercises = useCallback(async () => {
    const snap = await getDocs(collection(db, 'exercices'));
    const list = snap.docs.map(d => ({ id: d.id, ...(d.data()||{}) }));
    list.sort((a,b) => (a.nom||'').localeCompare(b.nom||''));
    setExos(list);
  }, [db]);

  // 1ère page
  const loadFirst = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setLoading(true);
    lastDocRef.current = null;

    try {
      // version idéale : dates au format Timestamp -> orderBy ok
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
      setCanPaginate(true);
    } catch {
      // fallback : mélange Timestamp/string -> tri client
      const q2 = query(
        collection(db, 'historiqueSeances'),
        where('utilisateurId', '==', user.uid),
        limit(200)
      );
      const snap2 = await getDocs(q2);
      let rows = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      rows = rows
        .map(r => ({ ...r, _d: r.date ? toJSDate(r.date) : (r.createdAt ? toJSDate(r.createdAt) : null) }))
        .filter(r => r._d && !Number.isNaN(r._d))
        .sort((a,b) => b._d - a._d);
      setItems(rows.map(normalizeRow));
      setCanPaginate(false);
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

  useFocusEffect(useCallback(() => {
    loadExercises();
    loadFirst();
  }, [loadExercises, loadFirst]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFirst();
    setRefreshing(false);
  };

  // filtre client
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter(it => {
      if (onlyThisMonth && it.date && it.date < startOfMonth) return false;

      // filtre exo id / nom
      if (exoSelected) {
        const hasId = (it.exercices||[]).some(ex => (ex.idExercice && ex.idExercice === exoSelected) || (ex.id && ex.id === exoSelected));
        if (!hasId) return false;
      } else if (exoSelectedName) {
        const hasName = (it.exercices||[]).some(ex => {
          const name = (ex.nomExercice || ex.nom || ex.name || '').toLowerCase();
          return name === exoSelectedName.toLowerCase();
        });
        if (!hasName) return false;
      }

      if (!term) return true;
      const hasTerm = (it.exercices || []).some(ex => {
        const name = (ex.nomExercice || ex.nom || ex.name || '').toLowerCase();
        return name.includes(term);
      });
      return hasTerm;
    });
  }, [items, search, onlyThisMonth, startOfMonth, exoSelected, exoSelectedName]);

  const onSelectExo = (val) => {
    setExoSelected(val);
    const found = exos.find(x => x.id === val);
    setExoSelectedName(found?.nom || '');
  };

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

      {/* Filtres ligne 1 */}
      <View style={styles.filters}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un exercice..."
          placeholderTextColor="#888"
          style={styles.search}
        />
      </View>

      {/* Filtres ligne 2 */}
      <View style={styles.filtersRow2}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#ccc', marginBottom: 6 }}>Exercice :</Text>
          <ExoDropdown
            value={exoSelected}
            onChange={onSelectExo}
            options={exos.map(x => ({ value: x.id, label: x.nom || 'Sans nom' }))}
          />
        </View>

        <TouchableOpacity
          onPress={() => setOnlyThisMonth(v => !v)}
          style={[styles.tag, onlyThisMonth && styles.tagOn]}
        >
          <Text style={{ color: onlyThisMonth ? '#001' : '#ccc' }}>Mois en cours</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
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

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1e1e1e', paddingHorizontal: 16, paddingTop: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },

  filters: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  search: {
    flex: 1, backgroundColor: '#252525', color: '#fff', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, marginRight: 8, borderColor: '#333', borderWidth: 1
  },

  filtersRow2: { flexDirection: 'row', alignItems:'flex-end', gap: 8, marginBottom: 8 },
  tag: {
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
    borderColor: '#555', marginLeft: 8, height: 46, justifyContent: 'center'
  },
  tagOn: { backgroundColor: '#00aaff' },

  // dropdown
  ddTrigger: {
    backgroundColor: '#252525', borderColor: '#333', borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  ddMenu: {
    position: 'absolute', top: 50, left: 0, right: 0,
    backgroundColor: '#1f1f1f', borderColor: '#333', borderWidth: 1, borderRadius: 10,
    maxHeight: 300, zIndex: 999,
    ...Platform.select({ android: { elevation: 10 } }),
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  ddItem: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },

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
