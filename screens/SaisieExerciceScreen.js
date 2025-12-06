import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput } from 'react-native';
import { getFirestore, collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export default function SaisieExerciceScreen({ route, navigation }) {
  const {
    indexExercice,
    utilisateursChoisis = [],
    onSave,
    idExercice,        // idéalement fourni
    nomExercice,       // peut être vide
    sessionId,         // si tu as un id de séance en cours
  } = route.params || {};

  const utilisateur = utilisateursChoisis[0]; // normalement un seul utilisateur

  // helpers
  const toNum = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(String(v).replace(',', '.'));
    return Number.isNaN(n) ? 0 : n;
  };
  const toJSDate = (v) => (v?.toDate ? v.toDate() : new Date(v));

  const getExerciseNameFromParams = (p = {}) => {
    const candidates = [
      p.nomExercice,
      p.exerciceNom,
      p.exercice?.nom,
      p.exerciceLabel,
      p.label,
      p.nom,
      p.name,
      p.title,
      nomExercice, // variable déstructurée
    ];
    return candidates.find((x) => typeof x === 'string' && x.trim().length > 0) || null;
  };

  const [exerciseName, setExerciseName] = useState(getExerciseNameFromParams(route.params) || null);

  // 👇 fallback: si pas de nom dans les params, on le récupère depuis Firestore grâce à idExercice
  useEffect(() => {
    const fetchExerciseName = async () => {
      if (exerciseName) return;           // on a déjà un nom
      const exoId = route.params?.idExercice || idExercice;
      if (!exoId) return;

      try {
        const db = getFirestore();
        // on tente d'abord la collection la plus probable
        const tryCollections = ['exercices', 'exercises'];
        for (const col of tryCollections) {
          const snap = await getDoc(doc(db, col, exoId));
          if (snap.exists()) {
            const d = snap.data() || {};
            const nom = d.nom || d.name || d.titre || d.title || null;
            if (nom) {
              setExerciseName(nom);
              return;
            }
          }
        }
      } catch (e) {
        console.warn('Impossible de récupérer le nom de l’exercice :', e);
      }
    };

    fetchExerciseName();
    // recheck si l’id change
  }, [route.params?.idExercice, idExercice, exerciseName]);

  const [data, setData] = useState(() => {
    if (route.params?.performancesExistantes) {
      const perf = route.params.performancesExistantes;
      const base = perf?.series ?? [{ poids: 0, repetitions: 8 }];
      return utilisateursChoisis.map(() =>
        base.map((s) => ({
          poids: toNum(s.poids),
          repetitions: toNum(s.repetitions || s.reps || 0),
        })),
      );
    }
    return utilisateursChoisis.map(() => [{ poids: 0, repetitions: 8 }]);
  });

    const [lastPerf, setLastPerf] = useState(null);

useEffect(() => {
  const fetchLastPerf = async () => {
    try {
      const db = getFirestore();
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      const exerciceKeyId = route.params?.idExercice || idExercice || null;
      const exerciceKeyName =
        getExerciseNameFromParams(route.params) || exerciseName || null;
      if (!exerciceKeyId && !exerciceKeyName) return;

      // 1) On récupère toutes les séances de l'utilisateur
      const q = query(
        collection(db, 'historiqueSeances'),
        where('utilisateurId', '==', user.uid)
      );
      const snap = await getDocs(q);
      let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 2) On ajoute une vraie date JS et on trie de la plus récente à la plus ancienne
      rows = rows
        .map((r) => ({
          ...r,
          _d: r.date
            ? toJSDate(r.date)
            : r.createdAt
            ? toJSDate(r.createdAt)
            : null,
        }))
        .filter((r) => r._d && !Number.isNaN(r._d))
        .sort((a, b) => b._d - a._d);

      const normalizeNumberOrNull = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(String(v).replace(',', '.'));
        return Number.isNaN(n) ? null : n;
      };

      let best = null;

      // 3) On parcourt TOUTES les séances jusqu'à trouver
      //    la plus récente où l'exo a AU MOINS une valeur (poids ou reps)
      for (const seance of rows) {
        // on ignore la séance en cours
        if (sessionId && seance.sessionId && seance.sessionId === sessionId) continue;
        if (seance.terminee === false) continue;

        const exercices = Array.isArray(seance.exercices)
          ? seance.exercices
          : [];
        const exerciceTrouve = exercices.find((ex) => {
          const hasId =
            (ex.idExercice && exerciceKeyId && ex.idExercice === exerciceKeyId) ||
            (ex.id && exerciceKeyId && ex.id === exerciceKeyId);
          const hasName =
            exerciceKeyName &&
            (ex.nomExercice === exerciceKeyName || ex.nom === exerciceKeyName);
          return hasId || hasName;
        });
        if (!exerciceTrouve) continue;

        let series =
          (Array.isArray(exerciceTrouve.series) &&
            exerciceTrouve.series.length > 0 &&
            exerciceTrouve.series) ||
          (exerciceTrouve.performances?.series &&
            Array.isArray(exerciceTrouve.performances.series) &&
            exerciceTrouve.performances.series) ||
          (Array.isArray(exerciceTrouve.sets) &&
            exerciceTrouve.sets.length > 0 &&
            exerciceTrouve.sets) ||
          null;

        if (!series) continue;

        const norm = series.map((s) => ({
          poids: normalizeNumberOrNull(s.poids),
          repetitions: normalizeNumberOrNull(
            s.repetitions !== undefined ? s.repetitions : s.reps
          ),
        }));

        // 👉 On ne garde cette séance que si AU MOINS UNE série a une valeur
        const hasRealValue = norm.some(
          (s) => s.poids !== null || s.repetitions !== null
        );
        if (!hasRealValue) {
          // exo présent mais jamais rempli dans cette séance → on remonte plus loin
          continue;
        }

        best = {
          date: seance._d || null,
          series: norm,
        };
        break; // on s'arrête au PREMIER match (le plus récent)
      }

      setLastPerf(best);
    } catch (e) {
      console.error('ERREUR récupération perf précédente :', e);
    }
  };

  fetchLastPerf();
}, [route.params?.idExercice, idExercice, route.params, sessionId, exerciseName]);


  const ajouterSerie = (indexUtilisateur) => {
    const copie = [...data];
    const ref = copie[indexUtilisateur][copie[indexUtilisateur].length - 1];
    copie[indexUtilisateur].push({ poids: ref.poids, repetitions: ref.repetitions });
    setData(copie);
  };

  const modifierValeur = (indexUtilisateur, indexSerie, champ, valeur) => {
    const copie = [...data];
    copie[indexUtilisateur][indexSerie][champ] =
      champ === 'poids' ? toNum(valeur) : parseInt(valeur, 10) || 0;
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

  if (!utilisateursChoisis || utilisateursChoisis.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e1e1e' }}>
        <Text style={{ color: 'white' }}>Aucun utilisateur sélectionné</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => navigation.goBack()}
        >
          <Text style={{ fontSize: 26, color: '#fff', marginBottom: 2 }}>←</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Saisie des performances</Text>
      </View>

      {/* Nom d'exercice juste sous le titre */}
      <Text style={styles.exerciseName}>{exerciseName || 'Exercice'}</Text>

      {/* Encart perf précédente */}
      {lastPerf && (
  <View style={styles.lastPerfBox}>
    <Text style={styles.lastPerfTitle}>
      Dernières performances
      {lastPerf.date
        ? ` — séance du ${lastPerf.date.toLocaleDateString('fr-FR')}`
        : ''}
      :
    </Text>
    {lastPerf.series.map((serie, i) => (
      <Text key={i} style={styles.lastPerfText}>
        Série {i + 1} : {serie.poids} kg x {serie.repetitions} reps
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
                value={String(serie.poids)}
                onChangeText={(val) => modifierValeur(i, j, 'poids', val)}
                keyboardType="numeric"
              />
              <Text style={styles.unit}>kg</Text>
              <TextInput
                style={styles.input}
                value={String(serie.repetitions)}
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
  container: { backgroundColor: '#1e1e1e', padding: 20, flexGrow: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', height: 60, marginBottom: 4, position: 'relative' },
  backBtn: { position: 'absolute', left: 0, top: 0, width: 50, height: 50, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  title: { fontSize: 20, color: '#fff', fontWeight: 'bold', flex: 1, textAlign: 'center' },
  exerciseName: { textAlign: 'center', color: '#00ffcc', fontWeight: '600', marginBottom: 12, fontSize: 16 },
  lastPerfBox: { backgroundColor: '#333', padding: 15, borderRadius: 10, marginBottom: 20 },
  lastPerfTitle: { color: '#00ffcc', fontWeight: 'bold', marginBottom: 8, fontSize: 16 },
  lastPerfText: { color: '#fff', fontSize: 14 },
  utilisateurBloc: { backgroundColor: '#2a2a2a', borderRadius: 10, padding: 15, marginBottom: 20 },
  nom: { color: '#00aaff', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  serieRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  label: { color: '#fff', marginRight: 10 },
  input: { backgroundColor: '#fff', borderRadius: 5, padding: 5, marginHorizontal: 5, width: 60, textAlign: 'center' },
  unit: { color: '#ccc', marginRight: 10 },
  ajouter: { marginTop: 10, alignItems: 'center' },
  ajouterText: { color: '#00ffcc' },
  button: { backgroundColor: '#007ACC', borderRadius: 10, padding: 15, marginTop: 10, alignItems: 'center' },
  buttonText: { color: '#ffffff', fontWeight: 'bold' },
});
