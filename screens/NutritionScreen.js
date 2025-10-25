import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { db, auth } from '../firebase';
import {
  collection, query, where, getDocs, orderBy, limit,
  doc, getDoc, setDoc
} from 'firebase/firestore';

/* ========= Helpers ========= */
const toJSDate = (val) => { try { return val?.toDate ? val.toDate() : new Date(val); } catch { return null; } };
const toNum = (v) => (v === null || v === undefined || v === '' ? 0 : Number(String(v).replace(',', '.')));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function parseBirthday(frStr) {
  if (!frStr || typeof frStr !== 'string') return null;
  const s = frStr.trim().replace(/[.\-\s]/g, '/');
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [_, jj, mm, aaaa] = m;
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

/* ====== Calculs ====== */
function mifflinStJeor({ sex, weightKg, heightCm, ageY }) {
  const base = 10*weightKg + 6.25*heightCm - 5*ageY + (sex === 'female' ? -161 : -5);
  return Math.round(base);
}
function palFactor(level) {
  const map = { sedentary: 1.55, light: 1.6, moderate: 1.8, high: 2.1 };
  return map[level] || 1.8;
}
function targetCalories(rmr, level, goal) {
  const tdee = rmr * palFactor(level);
  const adjust = goal === 'cut' ? 0.85 : goal === 'bulk' ? 1.10 : 1.00;
  return Math.round(tdee * adjust);
}
function proteinGramsPerDay({ goal, weightKg }) {
  const min = goal === 'cut' ? 1.6 : 1.6;
  const max = goal === 'cut' ? 2.4 : 2.2;
  return Math.round(weightKg * ((min + max) / 2));
}
function fatGramsPerDay({ calories, weightKg }) {
  const pct = 0.30;
  const gFromPct = Math.round((calories * pct) / 9);
  const floor = Math.round(0.8 * weightKg);
  return Math.max(gFromPct, floor);
}
function carbsGramsPerDay({ calories, protein_g, fat_g }) {
  const kcalUsed = protein_g*4 + fat_g*9;
  const carbsKcal = Math.max(0, calories - kcalUsed);
  return Math.round(carbsKcal / 4);
}
function computeMacroTargets({ sex, weightKg, heightCm, ageY, activity, goal }) {
  const rmr = mifflinStJeor({ sex, weightKg, heightCm, ageY });
  const calories = targetCalories(rmr, activity, goal);
  const protein_g = proteinGramsPerDay({ goal, weightKg });
  const fat_g = fatGramsPerDay({ calories, weightKg });
  const carbs_g = carbsGramsPerDay({ calories, protein_g, fat_g });
  return { calories, protein_g, carbs_g, fat_g, rmr };
}

export default function NutritionScreen({ navigation }) {
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [profilBase, setProfilBase] = useState({
    prenom: '',
    tailleCm: null,
    anniversaire: null,
    sexe: null,
    poidsKg: null,
  });

  const [activity, setActivity]   = useState('moderate'); // sedentary | light | moderate | high
  const [goal, setGoal]           = useState('cut');      // cut | maintain | bulk
  const [showHelp, setShowHelp]   = useState(false);

  const targets = useMemo(() => {
    const { tailleCm, anniversaire, sexe, poidsKg } = profilBase;
    const heightCm = toNum(tailleCm);
    const weightKg = toNum(poidsKg);
    const birth = parseBirthday(anniversaire);
    const ageY = computeAge(birth) ?? 30;
    if (!heightCm || !weightKg || !sexe) return null;
    return computeMacroTargets({ sex: sexe, weightKg, heightCm, ageY, activity, goal });
  }, [profilBase, activity, goal]);

  // ---- charge profil : doc(uid) OU doc où field uid == uid (fallback à cause de addDoc)
  const loadUserData = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      let p = null;

      const direct = await getDoc(doc(db, 'utilisateurs', user.uid));
      if (direct.exists()) {
        p = direct.data();
      } else {
        const qAlt = query(collection(db, 'utilisateurs'), where('uid', '==', user.uid));
        const altSnap = await getDocs(qAlt);
        if (!altSnap.empty) p = altSnap.docs[0].data();
      }

      const base = {
        prenom: p?.prenom || p?.identifiant || '',
        tailleCm: p?.taille ?? null,
        anniversaire: p?.anniversaire || '',
        sexe: p?.sexe || null,
        poidsKg: null,
      };

      // dernière mesure
      const qMes = query(
        collection(db, 'mesures'),
        where('utilisateurId', '==', user.uid),
        orderBy('date', 'desc'),
        limit(1)
      );
      const mSnap = await getDocs(qMes);
      if (!mSnap.empty) base.poidsKg = toNum(mSnap.docs[0].data()?.poids) || null;

      // nutrition profile (défauts)
      const profNutSnap = await getDoc(doc(db, 'nutritionProfiles', user.uid));
      if (profNutSnap.exists()) {
        const np = profNutSnap.data() || {};
        if (np.activityLevel) setActivity(np.activityLevel);
        if (np.goal) setGoal(np.goal);
      }

      setProfilBase(base);
    } catch (e) {
      console.error(e);
      Alert.alert('Erreur', "Impossible de charger les données utilisateur.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadUserData(); }, [loadUserData]);

  const saveNutritionProfile = async () => {
    if (!user) return;
    if (!targets) {
      Alert.alert('Infos manquantes', "Vérifie : sexe, taille, date de naissance et une mesure de poids.");
      return;
    }
    try {
      const { calories, protein_g, carbs_g, fat_g, rmr } = targets;
      await setDoc(
        doc(db, 'nutritionProfiles', user.uid),
        {
          uid: user.uid,
          label: goal === 'cut' ? 'Perte de poids' : goal === 'bulk' ? 'Prise de masse' : 'Maintien',
          goal,
          activityLevel: activity,
          caloriesTarget: calories,
          macrosTarget: { protein_g, carbs_g, fat_g },
          rmr,
          derivedFrom: {
            formula: 'Mifflin-St Jeor',
            pal: palFactor(activity),
            deficitOrSurplus: goal === 'cut' ? -0.15 : goal === 'bulk' ? +0.10 : 0.0,
            proteinRule: goal === 'cut' ? '1.6–2.4 g/kg' : '1.6–2.2 g/kg',
            fatRule: '≥0.8 g/kg & ~30% kcal',
          },
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
      <View style={[styles.container, { justifyContent:'center', alignItems:'center' }]}>
        <ActivityIndicator color="#00aaff" />
      </View>
    );
  }

  const p = profilBase;
  const canCompute = !!targets;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Nutrition — Profil & Cibles</Text>

      {/* Données */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Données utilisateur</Text>
        <Text style={styles.line}>Prénom : <Text style={styles.hl}>{p.prenom || '—'}</Text></Text>
        <Text style={styles.line}>Sexe : <Text style={styles.hl}>{p.sexe === 'female' ? 'Femme' : p.sexe === 'male' ? 'Homme' : '—'}</Text></Text>
        <Text style={styles.line}>Taille : <Text style={styles.hl}>{p.tailleCm ? `${p.tailleCm} cm` : '—'}</Text></Text>
        <Text style={styles.line}>Date de naissance : <Text style={styles.hl}>{p.anniversaire || '—'}</Text></Text>
        <Text style={styles.line}>Dernier poids : <Text style={styles.hl}>{p.poidsKg ? `${p.poidsKg} kg` : '—'}</Text></Text>
      </View>

      {/* Réglages */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Réglages du calcul</Text>

        <Text style={styles.label}>Niveau d’activité</Text>
        <View style={styles.segment}>
          {[
            ['sedentary','Sédentaire'],
            ['light','Léger'],
            ['moderate','Modéré'],
            ['high','Élevé'],
          ].map(([val, lab]) => (
            <TouchableOpacity
              key={val}
              style={[styles.segmentBtn, activity === val && styles.segmentBtnActive]}
              onPress={() => setActivity(val)}
            >
              <Text style={[styles.segmentText, activity === val && styles.segmentTextActive]}>{lab}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Mémo aide */}
        <TouchableOpacity onPress={() => setShowHelp(v => !v)} style={styles.memoBtn}>
          <Text style={styles.memoTitle}>ℹ️ Comprendre le niveau d’activité</Text>
        </TouchableOpacity>
        {showHelp && (
          <View style={styles.memoBox}>
            <Text style={styles.memoLine}>• <Text style={styles.hl}>Sédentaire</Text> : bureau toute la journée, peu de pas (&lt;6k), pas d’entraînement régulier.</Text>
            <Text style={styles.memoLine}>• <Text style={styles.hl}>Léger</Text> : 1–2 séances/sem OU 6–9k pas/j.</Text>
            <Text style={styles.memoLine}>• <Text style={styles.hl}>Modéré</Text> : 3–5 séances/sem, travail debout, 8–12k pas/j.</Text>
            <Text style={styles.memoLine}>• <Text style={styles.hl}>Élevé</Text> : 6+ séances/sem, job physique, sportif avancé.</Text>
          </View>
        )}

        <Text style={styles.label}>Objectif</Text>
        <View style={styles.segment}>
          {[
            ['cut','Perte de poids'],
            ['maintain','Maintien'],
            ['bulk','Prise de masse'],
          ].map(([val, lab]) => (
            <TouchableOpacity
              key={val}
              style={[styles.segmentBtn, goal === val && styles.segmentBtnActive]}
              onPress={() => setGoal(val)}
            >
              <Text style={[styles.segmentText, goal === val && styles.segmentTextActive]}>{lab}</Text>
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
          <Text style={{ color:'#aaa' }}>
            Infos insuffisantes pour calculer. Renseigne sexe, taille, date de naissance et une mesure de poids.
          </Text>
        )}
      </View>

      {/* Recettes — placeholder */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recettes</Text>
        <Text style={{ color:'#ccc', marginBottom: 8 }}>Crée, ajoute ou génère des recettes adaptées à tes cibles.</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('Recettes')}>
          <Text style={styles.secondaryBtnText}>Ouvrir la page Recettes</Text>
        </TouchableOpacity>
      </View>

      {/* Planning (bientôt) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Planning (à venir)</Text>
        <Text style={{ color:'#aaa' }}>Ici : nombre de repas/jour, slots, totaux jour vs cibles.</Text>
      </View>
    </ScrollView>
  );
}

/* === Bar === */
function Bar({ label, value, target, unit }) {
  const v = Number(value)||0;
  const t = Number(target)||0;
  const pct = t ? clamp(Math.round((v/t)*100), 0, 100) : 0;
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color:'#fff', marginBottom: 4 }}>{label} : {v} {unit}</Text>
      <View style={{ height:10, backgroundColor:'#2a2a2a', borderRadius:8, overflow:'hidden' }}>
        <View style={{ width: `${pct}%`, height:'100%', backgroundColor: '#00aaff' }} />
      </View>
    </View>
  );
}

/* === Styles === */
const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#1e1e1e' },
  title: { color:'#fff', fontWeight:'bold', fontSize:20, textAlign:'center', marginBottom: 10 },

  card: { backgroundColor:'#252525', borderRadius: 14, padding: 14, marginTop: 10, borderWidth:1, borderColor:'#333' },
  cardTitle: { color:'#00aaff', fontWeight:'bold', marginBottom: 8 },
  line: { color:'#fff', marginBottom: 2 },
  hl: { color:'#fff', fontWeight:'600' },

  label: { color:'#aaa', marginTop: 4, marginBottom: 6 },
  segment: { flexDirection:'row', gap: 8, marginBottom: 6, flexWrap:'wrap' },
  segmentBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor:'#444', backgroundColor:'#2a2a2a' },
  segmentBtnActive: { borderColor:'#00aaff', backgroundColor:'#00384D' },
  segmentText: { color:'#ccc', fontWeight:'600' },
  segmentTextActive: { color:'#00aaff' },

  memoBtn: { paddingVertical: 6 },
  memoTitle: { color:'#9adfff', fontWeight:'600' },
  memoBox: { backgroundColor:'#1f2b30', borderRadius:10, padding:10, borderWidth:1, borderColor:'#044' },
  memoLine: { color:'#d9f7ff', marginBottom: 4 },

  primaryBtn: { backgroundColor:'#007ACC', borderRadius:10, padding:12, alignItems:'center', marginTop: 10 },
  primaryBtnText: { color:'#fff', fontWeight:'bold' },

  secondaryBtn: { backgroundColor:'#333', borderRadius:10, padding:12, alignItems:'center', borderWidth:1, borderColor:'#00aaff' },
  secondaryBtnText: { color:'#00aaff', fontWeight:'bold' },
});
