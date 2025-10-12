// screens/HistoriqueSeancesScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, ScrollView, Modal, Pressable
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
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
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

/* ---------- dropdown en Modal (au-dessus de tout) ---------- */
function ExoDropdown({ value, onChange, options, label = 'Tous les exercices' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        style={styles.ddTrigger}
      >
        <Text style={{ color: '#fff' }}>
          {selected ? selected.label : label}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="fade"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        {/* Backdrop cliquable pour fermer */}
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          {/* on stoppe la propagation pour ne pas fermer en cliquant dans la box */}
          <Pressable onPress={() => {}} style={styles.modalBox}>
            <ScrollView>
              <TouchableOpacity
                onPress={() => {
                  onChange('');
                  setOpen(false);
                }}
                style={styles.ddItem}
              >
                <Text style={{ color: '#00aaff' }}>Tous</Text>
              </TouchableOpacity>

              {options.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  style={styles.ddItem}
                >
                  <Text style={{ color: '#fff' }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
  const [onlyThisMonth, setOnlyThisMonth] = useState(false);
  const [exos, setExos] = useState([]); // {id, nom}
  const [exoSelected, setExoSelected] = useState(''); // id
  const [exoSelectedName, setExoSelectedName] = useState(''); // nom pour fallback

  const startOfMonth = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const normalizeRow = (r) => {
    const d = r.date ? toJSDate(r.date) : r.createdAt ? toJSDate(r.createdAt) : null;
    const exercices = Array.isArray(r.exercices) ? r.exercices : [];
    return { id: r.id, date: d, exercices };
  };

  // charger exercices (pour le dropdown)
  const loadExercises = useCallback(async () => {
    const snap = await getDocs(collection(db, 'exercices'));
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    list.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
    setExos(list);
  }, [db]);

  // 1ère page
  const loadFirst = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setLoading(true);
    lastDocRef.current = null;

    try {
      // idéal : date en Timestamp → on peut orderBy
      const q1 = query(
        collection(db, 'historiqueSeances'),
        where('utilisateurId', '==', user.uid),
        orderBy('date', 'desc'),
        limit(PAGE_SIZE)
      );
      const snap1 = await getDocs(q1);
      const docs = snap1.docs.map((d) => ({ id: d.id, ...d.data(), __doc: d }));
      lastDocRef.current = snap1.docs.length ? snap1.docs[snap1.docs.length - 1] : null;
      setItems(docs.map(normalizeRow));
      setCanPaginate(true);
    } catch {
      // fallback : tri côté client
      const q2 = query(
        collection(db, 'historiqueSeances'),
        where('utilisateurId', '==', user.uid),
        limit(200)
      );
      const snap2 = await getDocs(q2);
      let rows = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows = rows
        .map((r) => ({
          ...r,
          _d: r.date ? toJSDate(r.date) : r.createdAt ? toJSDate(r.createdAt) : null,
        }))
        .filter((r) => r._d && !Number.isNaN(r._d))
        .sort((a, b) => b._d - a._d);
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
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data(), __doc: d }));
      lastDocRef.current = snap.docs[snap.docs.length - 1];
      setItems((prev) => [...prev, ...docs.map(normalizeRow)]);
    } finally {
      setIsPaginating(false);
    }
  }, [auth, db, canPaginate, isPaginating]);

  useFocusEffect(
    useCallback(() => {
      loadExercises();
      loadFirst();
    }, [loadExercises, loadFirst])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFirst();
    setRefreshing(false);
  };

  // filtre client (par exo + par mois)
  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (onlyThisMonth && it.date && it.date < startOfMonth) return false;

      // filtre exo id / nom
      if (exoSelected) {
        const hasId = (it.exercices || []).some(
          (ex) =>
            (ex.idExercice && ex.idExercice === exoSelected) ||
            (ex.id && ex.id === exoSelected)
        );
        if (!hasId) return false;
      } else if (exoSelectedName) {
        const hasName = (it.exercices || []).some((ex) => {
          const name = (ex.nomExercice || ex.nom || ex.name || '').toLowerCase();
          return name === exoSelectedName.toLowerCase();
        });
        if (!hasName) return false;
      }

      return true;
    });
  }, [items, onlyThisMonth, startOfMonth, exoSelected, exoSelectedName]);

  const onSelectExo = (val) => {
    setExoSelected(val);
    const found = exos.find((x) => x.id === val);
    setExoSelectedName(found?.nom || '');
  };

  const renderItem = ({ item }) => {
    const totalSeries = item.exercices.reduce((acc, ex) => {
      const s =
        (Array.isArray(ex.series) && ex.series) ||
        (ex.performances?.series &&
          Array.isArray(ex.performances.series) &&
          ex.performances.series) ||
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
              (ex.performances?.series &&
                Array.isArray(ex.performances.series) &&
                ex.performances.series) ||
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

      {/* Filtres : dropdown + mois en cours */}
      <View style={styles.filtersRow2}>
        <View style={{ flex: 1 }}>
          <ExoDropdown
            value={exoSelected}
            onChange={onSelectExo}
            options={exos.map((x) => ({ value: x.id, label: x.nom || 'Sans nom' }))}
          />
        </View>

        <TouchableOpacity
          onPress={() => setOnlyThisMonth((v) => !v)}
          style={[styles.tag, onlyThisMonth && styles.tagOn]}
        >
          <Text style={{ color: onlyThisMonth ? '#001' : '#ccc' }}>Mois en cours</Text>
        </TouchableOpacity>
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
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#00aaff"
            />
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

  filtersRow2: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },

  tag: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#555',
    marginLeft: 8,
    height: 46,
    justifyContent: 'center',
  },
  tagOn: { backgroundColor: '#00aaff' },

  // dropdown trigger
  ddTrigger: {
    backgroundColor: '#252525',
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  // modal dropdown
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalBox: {
    backgroundColor: '#1f1f1f',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    maxHeight: '70%',
    width: '100%',
    overflow: 'hidden',
  },
  ddItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },

  card: {
    backgroundColor: '#252525',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
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
