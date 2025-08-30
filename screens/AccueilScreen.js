import React, { useState, useCallback } from 'react';
import { SafeAreaView, Text, View, TouchableOpacity, StyleSheet, ScrollView, Modal, FlatList } from 'react-native';
import { collection, doc, deleteDoc, getDoc, getDocs, addDoc, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useFocusEffect } from '@react-navigation/native';

/* ========= Helpers ISO week & parité ========= */
function getWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // 0 = lundi
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // jeudi ISO
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
function isEvenWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const weekNo = 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
  return weekNo % 2 === 0;
}
/* ============================================ */

export default function AccueilScreen({ navigation }) {
  const [utilisateur, setUtilisateur] = useState(null);
  const [derniereSeance, setDerniereSeance] = useState(null);
  const [dernierPoids, setDernierPoids] = useState(null);
  const [planning, setPlanning] = useState({
    Lun: [], Mar: [], Mer: [], Jeu: [], Ven: [], Sam: [], Dim: []
  });

  const [selectedDate, setSelectedDate] = useState(new Date());
  const weekKey = getWeekKey(selectedDate);
  const even = isEvenWeek(selectedDate);

  const [modalVisible, setModalVisible] = useState(false);
  const [jourSelectionne, setJourSelectionne] = useState(null);
  const [seancesDisponibles, setSeancesDisponibles] = useState([]);

  useFocusEffect(
    useCallback(() => {
      const charger = async () => {
        const user = auth.currentUser;
        if (!user) return;

        // Utilisateur + dernier poids
        const docSnap = await getDoc(doc(db, "utilisateurs", user.uid));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUtilisateur({ id: user.uid, ...data });
          setDernierPoids(data.poids || null);
        }

        // Dernière séance
        const historiqueSnap = await getDocs(
          query(collection(db, "historiqueSeances"), where("utilisateurId", "==", user.uid))
        );
        const historiqueList = historiqueSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => new Date(b.date) - new Date(a.date));

        if (historiqueList.length > 0) {
          const derniere = historiqueList[0];
          let nomSeance = "Séance inconnue";
          if (derniere.nom) nomSeance = derniere.nom;
          else if (derniere.seance) nomSeance = derniere.seance;
          else if (derniere.idSeance) {
            try {
              const docSeance = await getDoc(doc(db, "seances", derniere.idSeance));
              nomSeance = docSeance.exists() ? (docSeance.data().nom || "Séance inconnue") : "Séance supprimée";
            } catch (e) {
              console.warn("Erreur récupération séance :", e);
            }
          }
          setDerniereSeance({ ...derniere, nom: nomSeance });
        }

        // ===== RÈGLES DE PLANNING =====
        // On charge toutes les règles, puis on applique la logique parité/once en code
        const planningSnap = await getDocs(
          query(collection(db, "planning"), where("utilisateurId", "==", user.uid))
        );

        const seancesSnap = await getDocs(collection(db, "seances"));
        const mapSeances = {};
        seancesSnap.forEach(docu => {
          mapSeances[docu.id] = docu.data().nom;
        });

        const p = { Lun: [], Mar: [], Mer: [], Jeu: [], Ven: [], Sam: [], Dim: [] };

        planningSnap.forEach(docu => {
          const d = docu.data();

          let applies = false;
          if (d.repetition === 'once') {
            applies = (d.weekKey === weekKey);
          } else if (d.repetition === 'semaine') {
            applies = true;
          } else if (d.repetition === 'paire') {
            applies = even;
          } else if (d.repetition === 'impaire') {
            applies = !even;
          } else {
            applies = true; // fallback ancien doc
          }

          if (!applies) return;

          if (p[d.jour]) {
            const nomSeance = mapSeances[d.idSeance] || d.nom || 'Séance';
            p[d.jour].push({
              id: docu.id,
              idSeance: d.idSeance,
              nom: nomSeance,
            });
          }
        });

        setPlanning(p);
      };

      charger();
    }, [weekKey]) // recharge quand on change de semaine via flèches
  );

  const ouvrirAjoutSeance = async (jour) => {
    const snapshot = await getDocs(collection(db, "seances"));
    const liste = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    setSeancesDisponibles(liste);
    setJourSelectionne(jour);
    setModalVisible(true);
  };

  // Ajout rapide = "toutes les semaines" par défaut
  const ajouterSeanceAuJour = async (idSeance) => {
    const user = auth.currentUser;
    if (!user || !jourSelectionne) return;

    const seance = seancesDisponibles.find(s => s.id === idSeance);
    if (!seance) return;

    const newDoc = await addDoc(collection(db, "planning"), {
      utilisateurId: user.uid,
      jour: jourSelectionne,
      repetition: 'semaine',
      idSeance: seance.id,
      nom: seance.nom,
    });

    setPlanning(prev => {
      const next = { ...prev };
      next[jourSelectionne] = [
        ...(next[jourSelectionne] || []),
        { id: newDoc.id, idSeance: seance.id, nom: seance.nom }
      ];
      return next;
    });

    setModalVisible(false);
  };

  const supprimerSeanceJour = async (jour, idx) => {
    const cible = planning[jour][idx];
    if (!cible?.id) return;
    await deleteDoc(doc(db, "planning", cible.id));
    const nouveau = { ...planning };
    nouveau[jour].splice(idx, 1);
    setPlanning(nouveau);
  };

  const changerSemaine = (dir) => {
    setSelectedDate(d => addWeeks(d, dir === 'prev' ? -1 : 1));
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {utilisateur && (
          <Text style={styles.bienvenue}>Bienvenue {utilisateur.identifiant}</Text>
        )}

        {/* Dernière séance */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dernière séance</Text>
          {derniereSeance ? (
            <>
              <Text style={styles.cardText}>{derniereSeance.nom || 'Nom non défini'}</Text>
              <Text style={styles.cardSubText}>
                {new Date(derniereSeance.date).toLocaleString()}
              </Text>
            </>
          ) : (
            <Text style={styles.cardText}>Aucune séance enregistrée</Text>
          )}
        </View>

        {/* Planning */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Planning de la semaine</Text>

          {/* Navigation de semaine (gardée) */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <TouchableOpacity onPress={() => changerSemaine('prev')}><Text style={{ color:'#00aaff', fontSize:18 }}>←</Text></TouchableOpacity>
            <Text style={{ color:'#fff' }}>{weekKey}{even ? ' (paire)' : ' (impaire)'}</Text>
            <TouchableOpacity onPress={() => changerSemaine('next')}><Text style={{ color:'#00aaff', fontSize:18 }}>→</Text></TouchableOpacity>
          </View>

          <View style={{ alignItems: 'center', width: '100%' }}>
            {/* Ligne 1 : Lun à Jeu */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
              {['Lun', 'Mar', 'Mer', 'Jeu'].map(jour => (
                <View key={jour} style={{ alignItems: 'center', width: 60 }}>
                  <Text style={{ color: '#00aaff', fontWeight: 'bold' }}>{jour}</Text>
                  {(planning[jour] || []).map((seance, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={{
                        marginTop: 4,
                        backgroundColor: '#00384D',
                        borderRadius: 8,
                        padding: 4,
                        minWidth: 36,
                        minHeight: 32,
                        justifyContent: 'center',
                        alignItems: 'center'
                      }}
                      onPress={() =>
                        seance.idSeance && navigation.navigate("LancerSeanceScreen", { idSeance: seance.idSeance })
                      }
                      onLongPress={() => supprimerSeanceJour(jour, idx)}
                    >
                      <Text style={{ color: '#fff', fontSize: 12 }}>
                        {seance.nom || 'Séance'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => ouvrirAjoutSeance(jour)}
                    style={{
                      marginTop: 2,
                      backgroundColor: '#005f91',
                      borderRadius: 8,
                      padding: 2,
                      minWidth: 24,
                      minHeight: 24,
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>+</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Séparateur */}
            <View style={{ height: 1, backgroundColor: '#00aaff', width: '90%', marginVertical: 8 }} />

            {/* Ligne 2 : Ven à Dim */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%' }}>
              {['Ven', 'Sam', 'Dim'].map(jour => (
                <View key={jour} style={{ alignItems: 'center', width: 60 }}>
                  <Text style={{ color: '#00aaff', fontWeight: 'bold' }}>{jour}</Text>
                  {(planning[jour] || []).map((seance, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={{
                        marginTop: 4,
                        backgroundColor: '#00384D',
                        borderRadius: 8,
                        padding: 4,
                        minWidth: 36,
                        minHeight: 32,
                        justifyContent: 'center',
                        alignItems: 'center'
                      }}
                      onPress={() =>
                        seance.idSeance && navigation.navigate("LancerSeanceScreen", { idSeance: seance.idSeance })
                      }
                      onLongPress={() => supprimerSeanceJour(jour, idx)}
                    >
                      <Text style={{ color: '#fff', fontSize: 12 }}>
                        {seance.nom || 'Séance'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => ouvrirAjoutSeance(jour)}
                    style={{
                      marginTop: 2,
                      backgroundColor: '#005f91',
                      borderRadius: 8,
                      padding: 2,
                      minWidth: 24,
                      minHeight: 24,
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>+</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Dernier poids */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dernier poids</Text>
          {dernierPoids ? (
            <Text style={styles.cardText}>{dernierPoids} kg</Text>
          ) : (
            <Text style={styles.cardText}>Pas de mesure récente</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.bulleButton}
          onPress={() => navigation.navigate('SeanceFreestyle')}
        >
          <Text style={styles.buttonText}>Démarrer une séance freestyle</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modale ajout séance */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.5)'
        }}>
          <View style={{
            backgroundColor: '#222',
            padding: 18,
            borderRadius: 16,
            width: '80%',
            alignItems: 'center'
          }}>
            <Text style={{ color: '#00aaff', fontSize: 18, marginBottom: 10 }}>Ajouter une séance</Text>
            {seancesDisponibles.length === 0 ? (
              <Text style={{ color: '#fff' }}>Aucune séance créée</Text>
            ) : (
              <FlatList
                data={seancesDisponibles}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{
                      padding: 10,
                      backgroundColor: '#00384D',
                      marginVertical: 4,
                      borderRadius: 8,
                      width: '100%'
                    }}
                    onPress={() => ajouterSeanceAuJour(item.id)}
                  >
                    <Text style={{ color: '#fff', fontSize: 15 }}>{item.nom}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity onPress={() => setModalVisible(false)} style={{ marginTop: 16 }}>
              <Text style={{ color: '#fff', fontSize: 16 }}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e1e' },
  scroll: { alignItems: 'center', padding: 20 },
  bienvenue: { fontSize: 22, color: '#ffffff', fontWeight: 'bold', marginBottom: 20 },
  card: {
    backgroundColor: '#252525',
    borderRadius: 20,
    width: '95%',
    padding: 18,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  cardTitle: { color: '#00aaff', fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  cardText: { color: '#fff', fontSize: 16 },
  cardSubText: { color: '#ccc', fontSize: 13, marginTop: 2 },
  bulleButton: {
    backgroundColor: '#232e33',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fff',
    paddingVertical: 18,
    paddingHorizontal: 34,
    marginTop: 18,
    alignItems: 'center'
  },
  buttonText: { color: '#00aaff', fontSize: 16, fontWeight: 'bold' }
});
