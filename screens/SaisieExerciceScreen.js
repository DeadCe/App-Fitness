// screens/SaisieExerciceScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
} from 'react-native';
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export default function SaisieExerciceScreen({ route, navigation }) {
  const {
    indexExercice,
    utilisateursChoisis = [],
    onSave,
    idExercice, // idéalement fourni
    nomExercice, // peut être vide
    sessionId, // id de séance en cours pour ne pas se prendre soi-même en "dernière perf"
    performancesExistantes,
  } = route.params || {};

  const utilisateur = utilisateursChoisis[0]; // normalement un seul utilisateur

  /* ------------------ helpers ------------------ */

  const toNum = (v) => {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  };

  const toJSDate = (v) => (v?.toDate ? v.toDate() : new Date(v));

  const getExerciseNameFromParams = (p = {}) => {
    const candidates = [
      p?.nomExercice,
      p?.exerciceNom,
      p?.exercice?.nom,
      p?.exerciceLabel,
      p?.label,
      p?.nom,
      p?.name,
      p?.title,
      nomExercice,
    ].filter(Boolean);
    return candidates.length ? String(candidates[0]) : null;
  };

  /* ------------------ state ------------------ */

  const [exerciseName, setExerciseName] = useState(
    getExerciseNameFromParams(route.params || {}) || null
  );

  // data = [ [ {poids, repetitions}, ... ] ] par utilisateur
  const [data, setData] = useState(() => {
    if (performancesExistantes && performancesExistantes.series) {
      const base = performancesExistantes.series;
      return utilisateursChoisis.map(() =>
        base.map((s) => ({
          poids: toNum(s.poids),
          repetitions: toNum(s.repetitions || s.reps || 0),
        }))
      );
    }
    // par défaut : 1 utilisateur, 1 série 0 kg x 8 reps
    return utilisateursChoisis.map(() => [{ poids: 0, repetitions: 8 }]);
  });

  // dernière perf trouvée en historique : { series: [...], commentaire: string|null }
  const [lastPerf, setLastPerf] = useState(null);

  // commentaire de la séance en cours
  const [commentaire, setCommentaire] = useState(
    (performancesExistantes?.commentaire || '').toString()
  );

  /* ------------------ récupération nom exo si manquant ------------------ */

  useEffect(() => {
    const fetchExerciseName = async () => {
      if (exerciseName) return;
      const exoId = route.params?.idExercice || idExercice;
      if (!exoId) return;

      try {
        const db = getFirestore();
        const tryCollections = ['exercices', 'exercises'];
        for (const col of tryCollections) {
          const snap = await getDoc(doc(db, col, exoId));
          if (snap.exists()) {
            const d = snap.data() || {};
            const nom =
              d.nom || d.name || d.titre || d.title || d.label || null;
            if (nom) {
              setExerciseName(String(nom));
              return;
            }
          }
        }
      } catch (e) {
        console.error('Erreur récupération nom exercice :', e);
      }
    };

    fetchExerciseName();
  }, [route.params?.idExercice, idExercice, exerciseName, route.params]);

  /* ------------------ récupération dernières perfs + commentaire ------------------ */

  useEffect(() => {
    const fetchLastPerf = async () => {
      try {
        const db = getFirestore();
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;

        const exerciceKeyId = route.params?.idExercice || idExercice || null;
        const exerciceKeyName =
          getExerciseNameFromParams(route.params || {}) || exerciseName || null;

        if (!exerciceKeyId && !exerciceKeyName) return;

        let rows = [];
        try {
          // cas idéal : on a un index sur date
          const q1 = query(
            collection(db, 'historiqueSeances'),
            where('utilisateurId', '==', user.uid),
            orderBy('date', 'desc'),
            limit(20)
          );
          const snap1 = await getDocs(q1);
          rows = snap1.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {
          console.warn(
            'orderBy(date) indisponible, fallback avec tri JS :',
            e
          );
          const q2 = query(
            collection(db, 'historiqueSeances'),
            where('utilisateurId', '==', user.uid),
            limit(50)
          );
          const snap2 = await getDocs(q2);
          rows = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
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
            .sort((a, b) => b._d - a._d)
            .slice(0, 20);
        }

        for (const seance of rows) {
          // on saute la séance en cours (si déjà en base avec sessionId)
          if (sessionId && seance.sessionId && seance.sessionId === sessionId)
            continue;
          // on ne garde que les séances terminées
          if (seance.terminee === false) continue;

          const exercices = Array.isArray(seance.exercices)
            ? seance.exercices
            : [];
          const exerciceTrouve = exercices.find((ex) => {
            const hasId =
              (ex.idExercice &&
                exerciceKeyId &&
                ex.idExercice === exerciceKeyId) ||
              (ex.id && exerciceKeyId && ex.id === exerciceKeyId);
            const hasName =
              exerciceKeyName &&
              (ex.nomExercice === exerciceKeyName ||
                ex.nom === exerciceKeyName);
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
            poids: toNum(s.poids),
            repetitions: toNum(s.repetitions || s.reps || 0),
          }));

          // on ne retient que si au moins un poids > 0
          if (norm.some((s) => s.poids > 0)) {
            const lastComment =
              exerciceTrouve.performances?.commentaire ??
              exerciceTrouve.commentaire ??
              null;

            setLastPerf({
              series: norm,
              commentaire: lastComment || null,
            });
            break;
          }
        }
      } catch (e) {
        console.error('ERREUR récupération perf précédente :', e);
      }
    };

    fetchLastPerf();
  }, [
    route.params?.idExercice,
    idExercice,
    route.params,
    sessionId,
    exerciseName,
  ]);

  /* ------------------ gestion des séries ------------------ */

  const ajouterSerie = (indexUser) => {
    setData((prev) => {
      const copy = [...prev];
      const userSeries = [...copy[indexUser]];
      userSeries.push({ poids: 0, repetitions: 8 });
      copy[indexUser] = userSeries;
      return copy;
    });
  };

  const changerValeur = (indexUser, indexSerie, champ, valeur) => {
    setData((prev) => {
      const copy = [...prev];
      const userSeries = [...copy[indexUser]];
      const serie = { ...userSeries[indexSerie] };
      serie[champ] = valeur.replace(',', '.');
      userSeries[indexSerie] = serie;
      copy[indexUser] = userSeries;
      return copy;
    });
  };

  const supprimerSerie = (indexUser, indexSerie) => {
    setData((prev) => {
      const copy = [...prev];
      const userSeries = [...copy[indexUser]];
      if (userSeries.length <= 1) {
        userSeries[0] = { poids: 0, repetitions: 8 };
      } else {
        userSeries.splice(indexSerie, 1);
      }
      copy[indexUser] = userSeries;
      return copy;
    });
  };

  /* ------------------ validation ------------------ */

  const valider = () => {
    const performances = utilisateursChoisis.map((u, i) => ({
      utilisateur: u.nom || u.name || u.email || 'Moi',
      series: data[i].map((s) => ({
        poids: toNum(s.poids),
        repetitions: toNum(s.repetitions),
      })),
      commentaire: (commentaire || '').trim(),
    }));

    if (onSave && performances.length > 0) {
      // pour l’instant on continue d’envoyer une seule perf (comme avant)
      onSave(performances[0]);
    }
    navigation.goBack();
  };

  /* ------------------ rendu ------------------ */

  const titre =
    exerciseName ||
    nomExercice ||
    performancesExistantes?.nomExercice ||
    `Exercice ${indexExercice + 1 || ''}`;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.titre}>{titre}</Text>

        {/* Bloc dernières perfs */}
        {lastPerf?.series && (
          <View style={styles.lastPerfBox}>
            <Text style={styles.lastPerfTitle}>Dernières performances :</Text>
            {lastPerf.series.map((serie, i) => (
              <Text key={i} style={styles.lastPerfText}>
                Série {i + 1} : {serie.poids} kg × {serie.repetitions} reps
              </Text>
            ))}
            {lastPerf.commentaire ? (
              <Text style={styles.lastPerfComment}>
                Commentaire précédent : {lastPerf.commentaire}
              </Text>
            ) : null}
          </View>
        )}

        {/* Saisie des séries (un utilisateur pour l’instant) */}
        {utilisateursChoisis.map((u, idxUser) => (
          <View key={idxUser} style={styles.utilisateurBloc}>
            <Text style={styles.nom}>
              {u.nom || u.name || u.email || 'Moi'}
            </Text>

            {data[idxUser].map((serie, idxSerie) => (
              <View key={idxSerie} style={styles.serieRow}>
                <Text style={styles.label}>Série {idxSerie + 1}</Text>
                <TextInput
                  keyboardType="numeric"
                  style={styles.input}
                  value={String(serie.poids)}
                  onChangeText={(v) =>
                    changerValeur(idxUser, idxSerie, 'poids', v)
                  }
                  placeholder="0"
                />
                <Text style={styles.unit}>kg</Text>
                <TextInput
                  keyboardType="numeric"
                  style={styles.input}
                  value={String(serie.repetitions)}
                  onChangeText={(v) =>
                    changerValeur(idxUser, idxSerie, 'repetitions', v)
                  }
                  placeholder="0"
                />
                <Text style={styles.unit}>reps</Text>

                <TouchableOpacity
                  onPress={() => supprimerSerie(idxUser, idxSerie)}
                >
                  <Text style={{ color: '#ff6666', marginLeft: 8 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={styles.ajouter}
              onPress={() => ajouterSerie(idxUser)}
            >
              <Text style={styles.ajouterText}>+ Ajouter une série</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Commentaire / ressenti */}
        <View style={styles.commentBox}>
          <Text style={styles.commentLabel}>Commentaire / ressenti :</Text>
          <TextInput
            style={styles.commentInput}
            multiline
            placeholder="Ex : RPE 8, bonne séance mais très dur sur la fin"
            placeholderTextColor="#888"
            value={commentaire}
            onChangeText={setCommentaire}
          />
        </View>

        {/* Bouton valider */}
        <TouchableOpacity style={styles.button} onPress={valider}>
          <Text style={styles.buttonText}>Valider</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/* ------------------ styles ------------------ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  titre: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  lastPerfBox: {
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  lastPerfTitle: {
    color: '#00ffcc',
    fontWeight: 'bold',
    marginBottom: 8,
    fontSize: 16,
  },
  lastPerfText: {
    color: '#fff',
    fontSize: 14,
  },
  lastPerfComment: {
    color: '#ccc',
    marginTop: 8,
    fontStyle: 'italic',
    fontSize: 13,
  },
  utilisateurBloc: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  nom: {
    color: '#00aaff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  serieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  label: {
    color: '#fff',
    marginRight: 10,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 5,
    padding: 5,
    marginHorizontal: 5,
    width: 60,
    textAlign: 'center',
  },
  unit: {
    color: '#ccc',
    marginRight: 10,
  },
  ajouter: {
    marginTop: 10,
    alignItems: 'center',
  },
  ajouterText: {
    color: '#00ffcc',
  },
  commentBox: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  commentLabel: {
    color: '#fff',
    marginBottom: 6,
  },
  commentInput: {
    backgroundColor: '#1e1e1e',
    color: '#fff',
    borderRadius: 8,
    padding: 8,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#007ACC',
    borderRadius: 10,
    padding: 15,
    marginTop: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});
