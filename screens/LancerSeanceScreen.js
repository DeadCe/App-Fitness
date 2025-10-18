import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, Modal, FlatList, BackHandler, AppState, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, getDocs, collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

const genSessionId = () => `sess_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

export default function LancerSeanceScreen({ route, navigation }) {
  const { idSeance, autoResume } = route.params || {};
  const [seance, setSeance] = useState(null);
  const [exercicesMap, setExercicesMap] = useState({});
  const [performances, setPerformances] = useState({});
  const [exercicesTemp, setExercicesTemp] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [exoRemplacementIndex, setExoRemplacementIndex] = useState(null);

  // session / draft refs
  const [sessionId] = useState(() => genSessionId());
  const draftKeyRef = useRef(null);
  const isFinalizingRef = useRef(false);       // ⬅️ coupe autosave + guard pendant Terminer
  const isNavigatingSilentlyRef = useRef(false); // ⬅️ désactive le beforeRemove prompt
  const saveTimer = useRef(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    draftKeyRef.current = `draft:seance:${user?.uid || 'anon'}:${idSeance}:${sessionId}`;
  }, [idSeance, sessionId]);

  // charge séance + exos + éventuel draft
  useEffect(() => {
    const charger = async () => {
      try {
        if (!idSeance) return;

        // séance
        const docRef = doc(db, 'seances', idSeance);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) throw new Error('Séance non trouvée');
        const seanceData = { id: docSnap.id, ...docSnap.data() };
        setSeance(seanceData);

        // exos dispo
        const utilisateur = auth.currentUser;
        const snapshotExos = await getDocs(collection(db, 'exercices'));
        const listeExos = snapshotExos.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(ex => ex.auteur === utilisateur.uid || ex.public === true);
        const map = {};
        listeExos.forEach(exo => { map[exo.id] = exo; });
        setExercicesMap(map);

        // draft (reprise auto si demandé)
        const draftPrefix = `draft:seance:${utilisateur?.uid || 'anon'}:${idSeance}:`;
        const allKeys = await AsyncStorage.getAllKeys();
        const keys = allKeys.filter(k => k.startsWith(draftPrefix));

        if (keys.length) {
          keys.sort();
          const lastKey = keys[keys.length - 1];
          const raw = await AsyncStorage.getItem(lastKey);
          const parsed = raw ? JSON.parse(raw) : null;

          const applyDraft = () => {
            if (parsed?.exercicesTemp) setExercicesTemp(parsed.exercicesTemp);
            if (parsed?.performances) setPerformances(parsed.performances);
          };

          if (autoResume) {
            applyDraft();
          } else {
            if (Platform.OS === 'web') {
              const ok = window.confirm('Une séance en cours a été retrouvée. Voulez-vous la reprendre ?');
              if (ok) applyDraft();
              else setExercicesTemp(seanceData.exercices || []);
            } else {
              Alert.alert(
                'Reprendre la séance ?',
                'Une séance en cours a été retrouvée.',
                [
                  { text: 'Ignorer', style: 'cancel', onPress: () => setExercicesTemp(seanceData.exercices || []) },
                  { text: 'Reprendre', onPress: applyDraft },
                ]
              );
            }
          }
        } else {
          setExercicesTemp(seanceData.exercices || []);
        }
      } catch (err) {
        console.error('Erreur de chargement :', err);
        Alert.alert('Erreur', 'Impossible de charger la séance.');
      }
    };
    charger();
  }, [idSeance, autoResume]);

  // AUTOSAVE (debounce) — coupé si finalisation en cours
  useEffect(() => {
    if (isFinalizingRef.current) return;        // ⬅️ coupe autosave
    setIsDirty(true);
    if (!draftKeyRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(
          draftKeyRef.current,
          JSON.stringify({
            seanceMeta: { idSeance, nom: seance?.nom || '' },
            exercicesTemp,
            performances,
            ts: Date.now(),
            sessionId
          })
        );
      } catch (e) {
        console.warn('Draft save error:', e);
      }
    }, 700);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [exercicesTemp, performances, seance?.nom, idSeance, sessionId]);

  // background save (aussi coupé si finalisation)
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active' && draftKeyRef.current && !isFinalizingRef.current) {
        try {
          await AsyncStorage.setItem(
            draftKeyRef.current,
            JSON.stringify({
              seanceMeta: { idSeance, nom: seance?.nom || '' },
              exercicesTemp,
              performances,
              ts: Date.now(),
              sessionId
            })
          );
        } catch {}
      }
    });
    return () => sub.remove();
  }, [exercicesTemp, performances, seance?.nom, idSeance, sessionId]);

  // Guard retour — désactivé si navigation silencieuse (finalisation)
  useEffect(() => {
    const confirmLeave = (action) => {
      if (isNavigatingSilentlyRef.current) {
        navigation.dispatch(action); // pas de prompt
        return;
      }
      if (Platform.OS === 'web') {
        const ok = window.confirm('Quitter la séance ? Vos saisies resteront en brouillon.');
        if (ok) navigation.dispatch(action);
      } else {
        Alert.alert(
          'Quitter la séance ?',
          'Vos saisies non validées resteront en brouillon.',
          [
            { text: 'Rester', style: 'cancel' },
            { text: 'Quitter', style: 'destructive', onPress: () => navigation.dispatch(action) },
          ]
        );
      }
    };

    const beforeRemove = navigation.addListener('beforeRemove', (e) => {
      if (!isDirty || isNavigatingSilentlyRef.current) return; // rien à protéger
      e.preventDefault();
      confirmLeave(e.data.action);
    });

    const onBackPress = () => {
      if (!isDirty || isNavigatingSilentlyRef.current) return false;
      confirmLeave({ type: 'GO_BACK' });
      return true;
    };
    const backSub = BackHandler.addEventListener('hardwareBackPress', onBackPress);

    return () => { beforeRemove(); backSub.remove(); };
  }, [navigation, isDirty]);

  // helpers purge tous les drafts de cette séance (toutes sessions)
  const purgeAllDraftsForSeance = async () => {
    try {
      const user = auth.currentUser;
      const prefix = `draft:seance:${user?.uid || 'anon'}:${idSeance}:`;
      const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(prefix));
      if (keys.length) await AsyncStorage.multiRemove(keys);
    } catch (e) {
      console.warn('Purge drafts error:', e);
    }
  };

  const allerSaisir = (exoId) => {
    const utilisateur = auth.currentUser;
    if (!utilisateur) {
      Alert.alert('Erreur', 'Aucun utilisateur connecté.');
      return;
    }
    navigation.navigate('SaisieExercice', {
      idExercice: exoId,
      nomExercice: exercicesMap[exoId]?.nom || undefined,
      utilisateursChoisis: [utilisateur],
      performancesExistantes: performances[exoId],
      sessionId,
      onSave: (nouvellePerf) => {
        setPerformances((prev) => ({ ...prev, [exoId]: nouvellePerf }));
      },
    });
  };

  const terminerSeance = async () => {
    const utilisateur = auth.currentUser;
    if (!utilisateur) {
      Alert.alert('Erreur', 'Aucun utilisateur connecté.');
      return;
    }
    try {
      // ⬇️ coupe autosave + guard et purge tous les drafts
      isFinalizingRef.current = true;
      isNavigatingSilentlyRef.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await purgeAllDraftsForSeance();
      setIsDirty(false);

      const exercicesEnregistrements = exercicesTemp.map((exoId) => {
        const exo = exercicesMap[exoId];
        const perf = performances[exoId] || {};
        const seriesNettoyees = (perf.series || []).map((s) => ({
          poids: Number(s?.poids) || 0,
          repetitions: Number(s?.repetitions) || 0,
        }));
        return {
          idExercice: exoId,
          nom: exo?.nom || 'Sans nom',
          performances: { series: seriesNettoyees },
        };
      });

      const nouvelleEntree = {
        date: new Date(),
        sessionId,
        seance: seance?.nom || '',
        utilisateurId: utilisateur.uid,
        exercices: exercicesEnregistrements,
        terminee: true,
      };

      await addDoc(collection(db, 'historiqueSeances'), nouvelleEntree);
      navigation.replace('RécapitulatifSéance', { nouvelleEntree });
    } catch (err) {
      console.error('Erreur sauvegarde séance :', err);
      Alert.alert('Erreur', "Impossible d'enregistrer la séance.");
      // si erreur, on réactive la garde/autosave
      isFinalizingRef.current = false;
      isNavigatingSilentlyRef.current = false;
      setIsDirty(true);
    }
  };

  const ouvrirModal = (index = null) => {
    setExoRemplacementIndex(index); // null = ajout
    setModalVisible(true);
  };
  const ajouterOuRemplacerExercice = (exoId) => {
    if (exoRemplacementIndex !== null) {
      const temp = [...exercicesTemp];
      temp[exoRemplacementIndex] = exoId;
      setExercicesTemp(temp);
    } else {
      setExercicesTemp((prev) => [...prev, exoId]);
    }
    setModalVisible(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Séance : {seance?.nom}</Text>
      </View>

      {exercicesTemp.map((exoId, index) => (
        <View key={`${exoId}-${index}`} style={styles.exerciceCard}>
          <TouchableOpacity onPress={() => allerSaisir(exoId)}>
            <Text style={styles.exerciceText}>{exercicesMap[exoId]?.nom || 'Exercice'}</Text>
            {performances[exoId] && <Text style={styles.valide}>✅ Enregistré</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => ouvrirModal(index)} style={styles.switchButton}>
            <Text style={{ color: '#00aaff' }}>🔄</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={styles.addButton} onPress={() => ouvrirModal(null)}>
        <Text style={styles.buttonText}>+ Ajouter un exercice</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.terminateButton} onPress={terminerSeance}>
        <Text style={styles.buttonText}>Terminer la séance</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalBackground}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choisir un exercice</Text>
            <FlatList
              data={Object.values(exercicesMap)}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => ajouterOuRemplacerExercice(item.id)}
                  style={styles.modalItem}
                >
                  <Text style={{ color: '#fff' }}>{item.nom}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={{ color: '#00aaff', textAlign: 'center', marginTop: 10 }}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#1e1e1e', padding: 20, flexGrow: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 60, marginBottom: 10, position: 'relative'
  },
  backButton: { position: 'absolute', left: 0, top: 0, width: 50, height: 50, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 26, color: '#fff' },
  title: { fontSize: 20, color: '#fff', fontWeight: 'bold', flex: 1, textAlign: 'center' },
  exerciceCard: {
    backgroundColor: '#2a2a2a', padding: 15, borderRadius: 10,
    marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  },
  exerciceText: { color: '#ffffff', fontSize: 16 },
  valide: { color: '#00ff00', fontSize: 14, marginTop: 5 },
  switchButton: { paddingHorizontal: 10 },
  addButton: { backgroundColor: '#444', borderRadius: 10, padding: 15, marginTop: 10, alignItems: 'center' },
  terminateButton: { backgroundColor: '#007ACC', borderRadius: 10, padding: 15, marginTop: 20, alignItems: 'center' },
  buttonText: { color: '#ffffff', fontWeight: 'bold' },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#2a2a2a', padding: 20, borderRadius: 10, width: '90%', maxHeight: '80%' },
  modalTitle: { color: '#00aaff', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  modalItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#444' }
});
