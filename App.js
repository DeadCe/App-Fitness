// App.js
import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

// Import des écrans
import AccueilScreen from './screens/AccueilScreen';
import ListeExercicesScreen from './screens/ListeExercicesScreen';
import ListeSeancesScreen from './screens/ListeSeancesScreen';
import ModifierUtilisateurScreen from './screens/ModifierUtilisateurScreen';
import ParametresScreen from './screens/ParametresScreen';
import AjouterExerciceScreen from './screens/AjouterExerciceScreen';
import AjouterSeanceScreen from './screens/AjouterSeanceScreen';
import SelectionSeanceScreen from './screens/SelectionSeanceScreen';
import LancerSeanceScreen from './screens/LancerSeanceScreen';
import SaisieExerciceScreen from './screens/SaisieExerciceScreen';
import RecapitulatifSeanceScreen from './screens/RecapitulatifSeanceScreen';
import ConnexionScreen from './screens/ConnexionScreen';
import PlanningScreen from './screens/PlanningScreen';
import SeanceFreestyleScreen from './screens/SeanceFreestyleScreen';
import CustomDrawerContent from './screens/CustomDrawerContent';
import ConsulterSeanceScreen from './screens/ConsulterSeanceScreen';
import ConsulterExerciceScreen from './screens/ConsulterExerciceScreen';
import AjouterMesureScreen from './screens/AjouterMesureScreen';
import HistoriqueSeancesScreen from './screens/HistoriqueSeancesScreen';
import SeanceDetailScreen from './screens/SeanceDetailScreen';
import PerformanceScreen from './screens/PerformanceScreen';


const Drawer = createDrawerNavigator();
const Stack = createNativeStackNavigator();

function DrawerRoot() {
  return (
    <Drawer.Navigator
      initialRouteName="Accueil"
      drawerContent={props => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        drawerActiveBackgroundColor: "#007ACC",
        drawerInactiveTintColor: "#fff",
        drawerActiveTintColor: "#fff",
        drawerStyle: { backgroundColor: "#222" }
      }}
    >
      <Drawer.Screen name="Accueil" component={AccueilScreen} />
      <Drawer.Screen name="Planning" component={PlanningScreen} />
      <Drawer.Screen name="Exercices" component={ListeExercicesScreen} />
      <Drawer.Screen name="Séances" component={ListeSeancesScreen} />
      <Drawer.Screen name="Profil" component={ModifierUtilisateurScreen} options={{ title: 'Utilisateur' }} />
      <Drawer.Screen name="Paramètres" component={ParametresScreen} />
      <Drawer.Screen name="HistoriqueSeances" component={HistoriqueSeancesScreen} options={{ title: 'Historique des séances' }} />
      <Drawer.Screen name="Performance" component={PerformanceScreen} options={{ title: 'Performance' }} />
    </Drawer.Navigator>
  );
}

export default function App() {
  const [utilisateur, setUtilisateur] = useState(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setUtilisateur(user);
      setChargement(false);
    });
    return unsubscribe;
  }, []);

  if (chargement) return null; // On attend la détection de l'état de connexion

  return (
    <>
      <RNStatusBar backgroundColor="#1e1e1e" barStyle="light-content" />
      <StatusBar style="light" />

      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {utilisateur ? (
            <Stack.Screen name="Root" component={DrawerRoot} />
          ) : (
            <Stack.Screen name="Connexion" component={ConnexionScreen} />
          )}
          <Stack.Screen name="AjouterExercice" component={AjouterExerciceScreen} />
          <Stack.Screen name="AjouterSeance" component={AjouterSeanceScreen} />
          <Stack.Screen name="SelectionSeance" component={SelectionSeanceScreen} />
          <Stack.Screen name="LancerSeanceScreen" component={LancerSeanceScreen} />
          <Stack.Screen name="SaisieExercice" component={SaisieExerciceScreen} />
          <Stack.Screen name="RécapitulatifSéance" component={RecapitulatifSeanceScreen} />
          <Stack.Screen name="SeanceFreestyle" component={SeanceFreestyleScreen} />
          <Stack.Screen name="ListeExercice" component={ListeExercicesScreen} />
          <Stack.Screen name="Accueil" component={AccueilScreen} />
          <Stack.Screen name="Utilisateur" component={ModifierUtilisateurScreen} />
          <Stack.Screen name="ConsulterSeance" component={ConsulterSeanceScreen} />
          <Stack.Screen name="ConsulterExercice" component={ConsulterExerciceScreen} />
          <Stack.Screen name="ModifierUtilisateur" component={ModifierUtilisateurScreen} />
          <Stack.Screen name="AjouterMesure" component={AjouterMesureScreen} options={{ title: 'Nouvelle mesure' }} />
          <Stack.Screen name="HistoriqueSeances" component={HistoriqueSeancesScreen} options={{ headerShown:false }} />
          <Stack.Screen name="SeanceDetail" component={SeanceDetailScreen} options={{ headerShown:false }} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
