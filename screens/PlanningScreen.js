import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Modal, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { db, auth } from '../firebase';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
} from 'firebase/firestore';

/* ========= MOD: helpers ISO week ========= */
// Retourne "YYYY-Www" ex: "2025-W35"
function getWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // 0 = lundi
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // jeudi
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const weekNo = 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
  const year = date.getUTCFullYear();
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}
function addWeeks(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + 7 * n);
  return d;
}
/* ========================================= */

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const REPETITIONS = [
  { label: 'Toutes les semaines', value: 'semaine' },
  { label: 'Semaines paires', value: 'paire' },
  { label: 'Semaines impaires', value: 'impaire' },
  { label: 'Une fois', value: 'once' },
];

export default function ProgrammerSeancesScreen() {
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [indexASupprimer, setIndexASupprimer] = useState(null);
  const [seancesDispo, setSeancesDispo] = useState([]);
  const [planning, setPlanning] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [editSeance, setEditSeance] = useState({
    jour: JOURS[0],
    seance: '',
    repetition: REPETITIONS[0].value,
  });

  /* ========= MOD: état semaine sélectionnée ========= */
  const [selectedDate, setSelectedDate] = useState(new Date());
  const weekKey = getWeekKey(selectedDate);
  /* ================================================ */

  const chargerPlanning = async () => {
    const utilisateur = auth.currentUser;
    if (!utilisateur) return;

    /* ========= MOD: filtrage par semaine ========= */
    const snapshot = await getDocs(
      query(
        collection(db, 'planning'),
        where('utilisateurId', '==', utilisateur.uid),
        where('weekKey', '==', weekKey)
      )
    );
    /* ============================================ */

    const liste = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    setPlanning(liste);
  };

  const chargerSeancesDispo = async () => {
    const snapshot = await getDocs(collection(db, 'seances'));
    const liste = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    setSeancesDispo(liste);
  };

  useEffect(() => {
    chargerPlanning();
    chargerSeancesDispo();
  /* ========= MOD: recharger quand la semaine change ========= */
  }, [weekKey]);
  /* ========================================================== */

  const ouvrirEdition = (item, index) => {
    setEditIndex(index);
    setEditSeance({
      jour: item.jour,
      /* ========= MOD: le Picker attend l'ID de séance, pas le nom ========= */
      seance: item.idSeance || '',
      /* ==================================================================== */
      repetition: item.repetition,
    });
    setModalVisible(true);
  };

  const enregistrerEdition = async () => {
    if (!editSeance.seance) {
      Alert.alert("Erreur", "Sélectionnez une séance !");
      return;
    }

    const utilisateur = auth.currentUser;
    if (!utilisateur) return;

    const seanceTrouvee = seancesDispo.find((s) => s.id === editSeance.seance);
    if (!seanceTrouvee) {
      Alert.alert("Erreur", "Séance introuvable.");
      return;
    }

    const nouvelle = {
      utilisateurId: utilisateur.uid,
      jour: editSeance.jour,
      repetition: editSeance.repetition,
      nom: seanceTrouvee.nom,
      idSeance: seanceTrouvee.id,
      /* ========= MOD: on enregistre la semaine ========= */
      weekKey,
      /* ================================================ */
    };

    if (editIndex !== null && planning[editIndex]?.id) {
      await updateDoc(doc(db, "planning", planning[editIndex].id), nouvelle);
    } else {
      await addDoc(collection(db, "planning"), nouvelle);
    }

    await chargerPlanning();
    setModalVisible(false);
    setEditIndex(null);
    setEditSeance({
      jour: JOURS[0],
      seance: '',
      repetition: REPETITIONS[0].value,
    });
  };

  const supprimer = async () => {
    if (indexASupprimer === null || !planning[indexASupprimer]?.id) return;

    await deleteDoc(doc(db, 'planning', planning[indexASupprimer].id));

    await chargerPlanning();
    setModalVisible(false);
    setConfirmVisible(false);
    setEditIndex(null);
    setIndexASupprimer(null);
  };

  const ouvrirAjout = () => {
    setEditIndex(null);
    setEditSeance({
      jour: JOURS[0],
      seance: '',
      repetition: REPETITIONS[0].value,
    });
    setModalVisible(true);
  };

  return (
    <View style={styles.container}>
      {/* ========= MOD: mini navigation de semaine ========= */}
      <View style={styles.weekBar}>
        <TouchableOpacity onPress={() => setSelectedDate(d => addWeeks(d, -1))}>
          <Text style={styles.weekArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.weekLabel}>{weekKey}</Text>
        <TouchableOpacity onPress={() => setSelectedDate(d => addWeeks(d, 1))}>
          <Text style={styles.weekArrow}>→</Text>
        </TouchableOpacity>
      </View>
      {/* ==================================================== */}

      <View style={styles.header}>
        <Text style={styles.title}>Programmation des séances</Text>
        <TouchableOpacity style={styles.ajouterBtn} onPress={ouvrirAjout}>
          <Text style={{ color: '#00aaff', fontSize: 18 }}>+ Ajouter</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={planning}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={{ color: '#aaa', textAlign: 'center', marginTop: 30 }}>
            Aucune programmation pour cette semaine
          </Text>
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={styles.ligne}
            onPress={() => ouvrirEdition(item, index)}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.jour}>{item.jour}</Text>
              <Text style={styles.nomSeance}>{item.nom}</Text>
              <Text style={styles.repetition}>
                {REPETITIONS.find((r) => r.value === item.repetition)?.label || ''}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Modale édition/ajout */}
      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={{ color: '#00aaff', fontWeight: 'bold', fontSize: 18, marginBottom: 14 }}>
              {editIndex === null ? 'Ajouter une programmation' : 'Modifier la programmation'}
            </Text>

            <View style={{ flexDirection: 'row', marginBottom: 10, flexWrap: 'wrap' }}>
              {JOURS.map((jour) => (
                <TouchableOpacity
                  key={jour}
                  style={[styles.jourBtn, editSeance.jour === jour && styles.jourBtnActif]}
                  onPress={() => setEditSeance({ ...editSeance, jour })}
                >
                  <Text style={{ color: editSeance.jour === jour ? '#00aaff' : '#fff' }}>{jour}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.input}>
              <Picker
                selectedValue={editSeance.seance}
                onValueChange={(itemValue) =>
                  setEditSeance({ ...editSeance, seance: itemValue })
                }
                dropdownIconColor="#00aaff"
                style={{ color: "#000", backgroundColor: "#fff" }}
              >
                <Picker.Item label="Sélectionner une séance" value="" />
                {seancesDispo.map((s) => (
                  <Picker.Item key={s.id} label={s.nom} value={s.id} />
                ))}
              </Picker>
            </View>

            <View style={{ marginTop: 10 }}>
              {REPETITIONS.map((rep) => (
                <TouchableOpacity
                  key={rep.value}
                  style={[styles.repBtn, editSeance.repetition === rep.value && styles.repBtnActif]}
                  onPress={() => setEditSeance({ ...editSeance, repetition: rep.value })}
                >
                  <Text style={{ color: editSeance.repetition === rep.value ? '#00aaff' : '#fff' }}>
                    {rep.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', marginTop: 18, justifyContent: 'space-between' }}>
              {editIndex !== null && (
                <TouchableOpacity
                  onPress={() => {
                    setIndexASupprimer(editIndex);
                    setConfirmVisible(true);
                  }}
                  style={[styles.actionBtn, { backgroundColor: '#aa3333' }]}
                >
                  <Text style={{ color: '#fff' }}>Supprimer</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={[styles.actionBtn, { backgroundColor: '#555' }]}
              >
                <Text style={{ color: '#fff' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={enregistrerEdition}
                style={[styles.actionBtn, { backgroundColor: '#007ACC' }]}
              >
                <Text style={{ color: '#fff' }}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modale de confirmation suppression */}
      <Modal
        transparent
        visible={confirmVisible}
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={{ color: '#fff', fontSize: 16, marginBottom: 14, textAlign: 'center' }}>
              Supprimer cette programmation ?
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <TouchableOpacity
                onPress={() => {
                  setConfirmVisible(false);
                  setIndexASupprimer(null);
                }}
                style={[styles.actionBtn, { backgroundColor: '#555' }]}
              >
                <Text style={{ color: '#fff' }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={supprimer}
                style={[styles.actionBtn, { backgroundColor: '#aa3333' }]}
              >
                <Text style={{ color: '#fff' }}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e1e', padding: 20 },
  /* ========= MOD: styles nav semaine ========= */
  weekBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  weekArrow: { color: '#00aaff', fontSize: 18, paddingHorizontal: 8 },
  weekLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  /* ========================================== */
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  title: { flex: 1, color: '#fff', fontSize: 20, fontWeight: 'bold' },
  ajouterBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#232e33',
    borderWidth: 1,
    borderColor: '#00aaff',
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#232e33',
    borderRadius: 14,
    marginBottom: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#333',
  },
  jour: { color: '#00aaff', fontWeight: 'bold', width: 54 },
  nomSeance: { color: '#fff', flex: 1, fontSize: 16 },
  repetition: { color: '#ccc', fontSize: 14, minWidth: 100, textAlign: 'right' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#222', borderRadius: 16, padding: 22, width: 320, maxWidth: '90%' },
  jourBtn: { padding: 7, marginRight: 6, marginBottom: 6, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  jourBtnActif: { backgroundColor: '#222', borderColor: '#00aaff' },
  input: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginVertical: 6 },
  repBtn: { padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#444', marginTop: 6 },
  repBtnActif: { backgroundColor: '#00384D', borderColor: '#00aaff' },
  actionBtn: { padding: 12, borderRadius: 10, minWidth: 90, alignItems: 'center', marginHorizontal: 4 },
});
