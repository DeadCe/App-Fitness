import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { db, auth } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  getDoc,
  setDoc,
  limit,
} from 'firebase/firestore';

/* ========= Helpers ========= */
const toNum = (v) =>
  v === null || v === undefined || v === '' ? 0 : Number(String(v).replace(',', '.'));

function parseBirthday(frStr) {
  if (!frStr || typeof frStr !== 'string') return null;
  const s = frStr.trim().replace(/[.\-\s]/g, '/');
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, jj, mm, aaaa] = m;
  const d = new Date(Number(aaaa), Number(mm) - 1, Number(jj));
  return isNaN(d.getTime()) ? null : d;
}

function computeAge(birthDate) {
  if (!birthDate) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/* ========= Formules ========= */
function mifflinStJeor({ sex, weightKg, heightCm, ageY }) {
  const base =
    10 * weightKg +
    6.25 * heightCm -
    5 * ageY +
    (sex === 'female' ? -161 : -5);
  return Math.round(base);
}

function palFactor(level) {
  const map = {
    sedentary: 1.55,
    light: 1.6,
    moderate: 1.8,
    high: 2.1,
  };
  return map[level] || 1.8;
}

function targetCalories(rmr, level, goal) {
  const tdee = rmr * palFactor(level);
  const adjust =
    goal === 'cut' ? 0.85 :
    goal === 'bulk' ? 1.1 :
    1.0;
  return Math.round(tdee * adjust);
}

function proteinGramsPerDay({ goal, weightKg }) {
  const min = goal === 'cut' ? 1.6 : 1.6;
  const max = goal === 'cut' ? 2.4 : 2.2;
  return Math.round(weightKg * ((min + max) / 2));
}

function fatGramsPerDay({ calories, weightKg }) {
  const pct = 0.3;
  const gFromPct = Math.round((calories * pct) / 9);
  const floor = Math.round(0.8 * weightKg);
  return Math.max(gFromPct, floor);
}

function carbsGramsPerDay({ calories, protein_g, fat_g }) {
  const kcalUsed = protein_g * 4 + fat_g * 9;
  const carbsKcal = Math.max(0, calories - kcalUsed);
  return Math.round(carbsKcal / 4);
}

function computeMacroTargets({
  sex,
  weightKg,
  heightCm,
  ageY,
  activity,
  goal,
}) {
  const rmr = mifflinStJeor({ sex, weightKg, heightCm, ageY });
  const calories = targetCalories(rmr, activity, goal);
  const protein_g = proteinGramsPerDay({ goal, weightKg });
  const fat_g = fatGramsPerDay({ calories, weightKg });
  const carbs_g = carbsGramsPerDay({ calories, protein_g, fat_g });
  return { calories, protein_g, carbs_g, fat_g, rmr };
}

/**
 * Assure qu'il existe un doc utilisateurs/{uid}.
 */
async function ensureUserDoc(currentUser, logCb) {
  let log = '';

  const ref = doc(db, 'utilisateurs', currentUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data() || {};
    log += `doc(uid) OK; champs: ${Object.keys(data).join(', ')}`;
    logCb(log);
    return { ref, data };
  }

  log += 'doc(uid) inexistant; ';

  // cherche un doc addDoc avec champ uid
  const qAlt = query(
    collection(db, 'utilisateurs'),
    where('uid', '==', currentUser.uid),
    limit(1)
  );
  const altSnap = await getDocs(qAlt);

  if (!altSnap.empty) {
    const d = altSnap.docs[0].data() || {};
    await setDoc(ref, d, { merge: true });
    log += 'doc(uid) recréé à partir de uid; champs: ' + Object.keys(d).join(', ');
    logCb(log);
    return { ref, data: d };
  }

  // rien trouvé : on crée un doc basique à partir de l'auth
  const base = {
    uid: currentUser.uid,
    email: currentUser.email || null,
    identifiant: currentUser.email || null,
    dateCreation: new Date(),
  };
  await setDoc(ref, base, { merge: true });
  log += 'aucun doc trouvé; doc(uid) créé (minimal).';
  logCb(log);
  return { ref, data: base };
}

/* ========= Screen ========= */
export default function NutritionScreen() {
  const [loading, setLoading] = useState(true);
  const [profilBase, setProfilBase] = useState({
    prenom: '',
    tailleCm: null,
    anniversaire: '',
    sexe: null,
    poidsKg: null,
  });

  const [activity, setActivity] = useState('moderate');
  const [goal, setGoal] = useState('cut');
  const [showHelp, setShowHelp] = useState(false);

  // DEBUG
  const [debugInfo, setDebugInfo] = useState('');

  // ==== CALCUL DES CIBLES ====
  const targets = useMemo(() => {
    const { tailleCm, anniversaire, sexe, poidsKg } = profilBase;
    const heightCm = toNum(tailleCm);
    const weightKg = toNum(poidsKg);
    const birth = parseBirthday(anniversaire);
    const ageY = computeAge(birth) ?? 30;

    if (!heightCm || !weightKg || !sexe) return null;

    return computeMacroTargets({
      sex: sexe,
      weightKg,
      heightCm,
      ageY,
      activity,
      goal,
    });
  }, [profilBase, activity, goal]);

  // ==== CHARGER PROFIL + DERNIER POIDS AVEC DEBUG ====
  const loadUserData = async () => {
    const currentUser = auth.currentUser;

    let log = '';
    if (!currentUser) {
      log += 'auth.currentUser = null';
      setDebugInfo(log);
      setLoading(false);
      return;
    }

    log += `auth uid=${currentUser.uid}, email=${currentUser.email} | `;

    try {
      // 1) s'assurer qu'il existe un doc utilisateurs/{uid}
      const { data } = await ensureUserDoc(currentUser, (extraLog) => {
        log += extraLog + ' | ';
      });

      const base = {
        prenom: data.prenom || data.identifiant || '',
        tailleCm: data.taille ?? null,
        anniversaire: data.anniversaire || '',
        sexe: data.sexe || null,
        poidsKg: null,
      };

      // 2) récupérer la dernière mesure de poids
      const qMes = query(
        collection(db, 'mesures'),
        where('utilisateurId', '==', currentUser.uid),
        orderBy('date', 'desc'),
        limit(1)
      );
      const snapshot = await getDocs(qMes);
      if (!snapshot.empty) {
        const row = snapshot.docs[0].data() || {};
        base.poidsKg = toNum(row.poids) || null;
        log += `mesure trouvée: poids=${row.poids}`;
      } else {
        log += 'aucune mesure trouvée';
      }

      setProfilBase(base);
      setDebugInfo(log);
    } catch (e) {
      console.error('Erreur chargement profil/mesures (nutrition) :', e);
      Alert.alert('Erreur', 'Impossible de charger vos informations pour la nutrition.');
      log += 'ERREUR: ' + String(e?.message || e);
      setDebugInfo(log);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUserData();
  }, []);

  // ==== SAUVEGARDE DU PROFIL NUTRITION ====
  const saveNutritionProfile = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    if (!targets) {
      Alert.alert(
        'Infos manquantes',
        'Renseigne ton sexe, ta taille, ta date de naissance et au moins une mesure de poids.'
      );
      return;
    }

    try {
      const { calories, protein_g, carbs_g, fat_g, rmr } = targets;
      await setDoc(
        doc(db, 'nutritionProfiles', currentUser.uid),
        {
          uid: currentUser.uid,
          goal,
          activityLevel: activity,
          label:
            goal === 'cut'
              ? 'Perte de poids'
              : goal === 'bulk'
              ? 'Prise de masse'
              : 'Maintien',
          caloriesTarget: calories,
          macrosTarget: { protein_g, carbs_g, fat_g },
          rmr,
          updatedAt: new Date(),
        },
        { merge: true }
      );
      Alert.alert('OK', 'Profil nutrition enregistré.');
    } catch (e) {
      console.error(e);
      Alert.alert('Erreur', "Sauvegarde du profil nutrition impossible.");
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#00aaff" />
      </View>
    );
  }

  const p = profilBase;
  const canCompute = !!targets;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Nutrition — Profil & Cibles</Text>

      {/* DEBUG */}
      <View style={styles.debugBox}>
        <Text style={{ color: '#ffb' }}>
          DEBUG : {debugInfo || 'aucune info'}
        </Text>
      </View>

      {/* Données utilisateur */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Données utilisateur</Text>
        <Text style={styles.line}>
          Prénom : <Text style={styles.hl}>{p.prenom || '—'}</Text>
        </Text>
        <Text style={styles.line}>
          Sexe :{' '}
          <Text style={styles.hl}>
            {p.sexe === 'female'
              ? 'Femme'
              : p.sexe === 'male'
              ? 'Homme'
              : '—'}
          </Text>
        </Text>
        <Text style={styles.line}>
          Taille : <Text style={styles.hl}>{p.tailleCm ? `${p.tailleCm} cm` : '—'}</Text>
        </Text>
        <Text style={styles.line}>
          Date de naissance : <Text style={styles.hl}>{p.anniversaire || '—'}</Text>
        </Text>
        <Text style={styles.line}>
          Dernier poids : <Text style={styles.hl}>{p.poidsKg ? `${p.poidsKg} kg` : '—'}</Text>
        </Text>
      </View>

      {/* Réglages du calcul */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Réglages du calcul</Text>

        <Text style={styles.label}>Niveau d’activité</Text>
        <View style={styles.segment}>
          {[
            ['sedentary', 'Sédentaire'],
            ['light', 'Léger'],
            ['moderate', 'Modéré'],
            ['high', 'Élevé'],
          ].map(([val, lab]) => (
            <TouchableOpacity
              key={val}
              style={[
                styles.segmentBtn,
                activity === val && styles.segmentBtnActive,
              ]}
              onPress={() => setActivity(val)}
            >
              <Text
                style={[
                  styles.segmentText,
                  activity === val && styles.segmentTextActive,
                ]}
              >
                {lab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Mémo explicatif */}
        <TouchableOpacity onPress={() => setShowHelp((v) => !v)} style={styles.memoBtn}>
          <Text style={styles.memoTitle}>ℹ️ Comprendre le niveau d’activité</Text>
        </TouchableOpacity>
        {showHelp && (
          <View style={styles.memoBox}>
            <Text style={styles.memoLine}>
              • <Text style={styles.hl}>Sédentaire</Text> : travail assis, peu de pas (&lt; 6k/j),
              pas ou très peu de sport.
            </Text>
            <Text style={styles.memoLine}>
              • <Text style={styles.hl}>Léger</Text> : 1–2 séances/semaine OU 6–9k pas/jour.
            </Text>
            <Text style={styles.memoLine}>
              • <Text style={styles.hl}>Modéré</Text> : 3–5 séances/semaine, beaucoup debout,
              8–12k pas/jour.
            </Text>
            <Text style={styles.memoLine}>
              • <Text style={styles.hl}>Élevé</Text> : travail physique ou sportif avancé,
              6+ séances/semaine.
            </Text>
          </View>
        )}

        <Text style={styles.label}>Objectif</Text>
        <View style={styles.segment}>
          {[
            ['cut', 'Perte de poids'],
            ['maintain', 'Maintien'],
            ['bulk', 'Prise de masse'],
          ].map(([val, lab]) => (
            <TouchableOpacity
              key={val}
              style={[
                styles.segmentBtn,
                goal === val && styles.segmentBtnActive,
              ]}
              onPress={() => setGoal(val)}
            >
              <Text
                style={[
                  styles.segmentText,
                  goal === val && styles.segmentTextActive,
                ]}
              >
                {lab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Cibles */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cibles quotidiennes</Text>
        {canCompute ? (
          <>
            <Bar label="Calories" value={targets.calories} target={targets.calories} unit="kcal" />
            <Bar label="Protéines" value={targets.protein_g} target={targets.protein_g} unit="g" />
            <Bar label="Glucides" value={targets.carbs_g} target={targets.carbs_g} unit="g" />
            <Bar label="Lipides" value={targets.fat_g} target={targets.fat_g} unit="g" />

            <TouchableOpacity style={styles.primaryBtn} onPress={saveNutritionProfile}>
              <Text style={styles.primaryBtnText}>Enregistrer le profil nutrition</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={{ color: '#aaa' }}>
            Infos insuffisantes pour calculer. Renseigne ton sexe, ta taille, ta date de naissance
            et ajoute au moins une mesure de poids.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

/* ===== Barre simple ===== */
function Bar({ label, value, target, unit }) {
  const v = Number(value) || 0;
  const t = Number(target) || 0;
  const pct = t ? clamp(Math.round((v / t) * 100), 0, 100) : 0;

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: '#fff', marginBottom: 4 }}>
        {label} : {v} {unit}
      </Text>
      <View
        style={{
          height: 10,
          backgroundColor: '#2a2a2a',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: '#00aaff',
          }}
        />
      </View>
    </View>
  );
}

/* ===== Styles ===== */
const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#1e1e1e',
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 10,
  },
  debugBox: {
    backgroundColor: '#402',
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
  },
  card: {
    backgroundColor: '#252525',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardTitle: { color: '#00aaff', fontWeight: 'bold', marginBottom: 8 },
  line: { color: '#fff', marginBottom: 2 },
  hl: { color: '#fff', fontWeight: '600' },

  label: { color: '#aaa', marginTop: 4, marginBottom: 6 },
  segment: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  segmentBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#444',
    backgroundColor: '#2a2a2a',
  },
  segmentBtnActive: { borderColor: '#00aaff', backgroundColor: '#00384D' },
  segmentText: { color: '#ccc', fontWeight: '600' },
  segmentTextActive: { color: '#00aaff' },

  memoBtn: { paddingVertical: 6 },
  memoTitle: { color: '#9adfff', fontWeight: '600' },
  memoBox: {
    backgroundColor: '#1f2b30',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#044',
    marginBottom: 6,
  },
  memoLine: { color: '#d9f7ff', marginBottom: 4 },

  primaryBtn: {
    backgroundColor: '#007ACC',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: 'bold' },
});
