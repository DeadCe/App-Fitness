import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useIsFocused } from '@react-navigation/native';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, orderBy, doc, getDoc, setDoc } from 'firebase/firestore';

const screenWidth = Dimensions.get('window').width;

// helpers
const toJSDate = (val) => {
  if (!val) return null;
  try {
    if (val?.toDate) return val.toDate();          // Firestore Timestamp
    const d = new Date(val);                        // ISO string (ou autre)
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};
const toNum = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

export default function ModifierUtilisateurScreen({ navigation }) {
  const isFocused = useIsFocused();

  // profil
  const [prenom, setPrenom] = useState('');
  const [taille, setTaille] = useState('');           // string pour l’input (ex: "178")
  const [anniversaire, setAnniversaire] = useState(''); // ex: "JJ/MM/AAAA"
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // mesures
  const [mesures, setMesures] = useState([]);

  // Charger profil + mesures (Firestore)
  const chargerInfos = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    try {
      // ---- profil
      const profilSnap = await getDoc(doc(db, 'utilisateurs', currentUser.uid));
      if (profilSnap.exists()) {
        const p = profilSnap.data() || {};
        setPrenom(p.prenom || '');
        setTaille(p.taille ? String(p.taille) : '');
        setAnniversaire(p.anniversaire || ''); // on garde ton champ tel quel
      } else {
        setPrenom('');
        setTaille('');
        setAnniversaire('');
      }
      setDirty(false);

      // ---- mesures (NB: le champ est "utilisateurId")
      const qMes = query(
        collection(db, 'mesures'),
        where('utilisateurId', '==', currentUser.uid),
        orderBy('date', 'asc') // tri explicite croissant
      );
      const snapshot = await getDocs(qMes);
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMesures(list);
    } catch (e) {
      console.error('Erreur chargement profil/mesures :', e);
      Alert.alert('Erreur', 'Impossible de charger vos informations.');
    }
  };

  useEffect(() => {
    if (isFocused) chargerInfos();
  }, [isFocused]);

  // Sauvegarde profil → Firestore
  const sauvegarder = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    if (saving) return;

    // validation taille simple
    const tNum = taille ? Number(String(taille).replace(',', '.')) : null;
    if (taille && (Number.isNaN(tNum) || tNum < 50 || tNum > 260)) {
      Alert.alert('Erreur', 'La taille doit être un nombre réaliste en cm (ex: 178).');
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, 'utilisateurs', currentUser.uid),
        {
          prenom: prenom || '',
          taille: tNum ?? null,
          anniversaire: anniversaire || '',
          updatedAt: new Date(),
        },
        { merge: true }
      );
      setDirty(false);
      Alert.alert('Succès', 'Profil enregistré.');
    } catch (e) {
      console.error(e);
      Alert.alert('Erreur', "L'enregistrement a échoué.");
    } finally {
      setSaving(false);
    }
  };

  // === Préparation des points pour le graphe (robuste) ===
  // On normalise chaque mesure : date = date || createdAt, valeurs numériques
  const points = (mesures || [])
    .map((m, i) => {
      const d = toJSDate(m.date) || toJSDate(m.createdAt);
      const poids = toNum(m.poids);
      const mg = toNum(m.masseGrasse);
      const mm = toNum(m.masseMusculaire);
      return { id: m.id || String(i), d, poids, mg, mm };
    })
    // filtre les lignes complètement vides ET garde même si une seule valeur est non nulle
    .filter(p => p.d && (!isNaN(p.poids) || !isNaN(p.mg) || !isNaN(p.mm)));

  // Si aucune date valide, on crée des dates artificielles (index) pour que le chart ait au moins des labels cohérents
  const finalPoints = points.length > 0
    ? points
    : (mesures || []).map((m, i) => ({
        id: m.id || String(i),
        d: new Date(2000, 0, i + 1), // fallback visuel
        poids: toNum(m.poids),
        mg: toNum(m.masseGrasse),
        mm: toNum(m.masseMusculaire),
      }));

  const hasData = finalPoints.length > 0;

  const labels = hasData
    ? finalPoints.map(p => {
        const d = p.d;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}`;
      })
    : [' '];

  const graphData = {
    labels,
    datasets: [
      {
        data: hasData ? finalPoints.map(p => (isNaN(p.poids) ? 0 : p.poids)) : [0],
        color: () => 'rgba(255,255,255,1)',
        strokeWidth: 2,
      },
      {
        data: hasData ? finalPoints.map(p => (isNaN(p.mm) ? 0 : p.mm)) : [0],
        color: () => 'rgba(0,122,255,1)',
        strokeWidth: 2,
      },
      {
        data: hasData ? finalPoints.map(p => (isNaN(p.mg) ? 0 : p.mg)) : [0],
        color: () => 'rgba(255,99,132,1)',
        strokeWidth: 2,
      }
    ],
    legend: ['Poids', 'Masse musculaire', 'Masse grasse'],
  };

  const derniereMesure =
    finalPoints.length > 0
      ? { date: finalPoints[finalPoints.length - 1].d, ...finalPoints[finalPoints.length - 1] }
      : null;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Mon Profil</Text>

      <Text style={styles.label}>Prénom :</Text>
      <TextInput
        style={styles.input}
        value={prenom}
        onChangeText={(text) => { setPrenom(text); setDirty(true); }}
        placeholder="Prénom"
        placeholderTextColor="#999"
      />

      <Text style={styles.label}>Taille (cm) :</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={taille}
        onChangeText={(text) => { setTaille(text); setDirty(true); }}
        placeholder="Taille"
        placeholderTextColor="#999"
      />

      <Text style={styles.label}>Date de naissance :</Text>
      <TextInput
        style={styles.input}
        value={anniversaire}
        onChangeText={(text) => { setAnniversaire(text); setDirty(true); }}
        placeholder="JJ/MM/AAAA"
        placeholderTextColor="#999"
      />

      {dirty && (
        <TouchableOpacity style={styles.saveButton} onPress={sauvegarder} disabled={saving}>
          <Text style={styles.saveText}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Text>
        </TouchableOpacity>
      )}

      {derniereMesure && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dernière mesure :</Text>
          <Text style={styles.info}>
            Date : {derniereMesure.date.toLocaleString()}
          </Text>
          <Text style={styles.info}>Poids : {isNaN(derniereMesure.poids) ? '-' : derniereMesure.poids} kg</Text>
          <Text style={styles.info}>Masse grasse : {isNaN(derniereMesure.mg) ? '-' : derniereMesure.mg} %</Text>
          <Text style={styles.info}>Masse musculaire : {isNaN(derniereMesure.mm) ? '-' : derniereMesure.mm} %</Text>
        </View>
      )}

      <View style={{ marginTop: 20 }}>
        <Text style={styles.sectionTitle}>Évolution :</Text>
        <LineChart
          data={graphData}
          width={screenWidth - 40}
          height={220}
          chartConfig={{
            backgroundColor: '#1e1e1e',
            backgroundGradientFrom: '#1e1e1e',
            backgroundGradientTo: '#1e1e1e',
            decimalPlaces: 1,
            color: () => '#00aaff',
            labelColor: () => '#fff',
            propsForDots: { r: '3', strokeWidth: '1', stroke: '#fff' }
          }}
          style={{ marginVertical: 10, borderRadius: 10 }}
        />
        {!hasData && <Text style={{ color:'#aaa', fontStyle:'italic' }}>Aucune mesure pour le moment</Text>}
      </View>

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate('AjouterMesure')}
      >
        <Text style={styles.saveText}>Ajouter une mesure</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#1e1e1e' },
  title: { fontSize: 24, color: '#fff', fontWeight: 'bold', marginBottom: 20 },
  label: { color: '#aaa', marginTop: 15 },
  input: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
    padding: 10,
    borderRadius: 6,
    marginBottom: 10
  },
  saveButton: {
    backgroundColor: '#00aaff',
    padding: 12,
    marginTop: 10,
    borderRadius: 6,
    alignItems: 'center'
  },
  saveText: { color: '#fff', fontWeight: 'bold' },
  section: { marginTop: 30 },
  sectionTitle: { color: '#00aaff', fontSize: 18, marginBottom: 5 },
  info: { color: '#fff', marginBottom: 4 },
  addButton: {
    backgroundColor: '#007ACC',
    padding: 12,
    marginTop: 30,
    borderRadius: 6,
    alignItems: 'center'
  }
});
