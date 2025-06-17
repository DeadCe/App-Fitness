import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    </Drawer.Navigator>
  );
}

export default function App() {
  const [initialScreen, setInitialScreen] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkConnexion = async () => {
      const data = await AsyncStorage.getItem('utilisateurConnecté');
      setInitialScreen(data ? 'Root' : 'Connexion');
      setIsReady(true); // <--- Ne pas afficher tant qu'on n'a pas cette info
    };
    checkConnexion();
  }, []);

  if (!isReady) return null; // <--- Fix : évite de charger avant d'avoir décidé quel écran lancer

  return (
    <>
      <RNStatusBar backgroundColor="#1e1e1e" barStyle="light-content" />
      <StatusBar style="light" />

      <NavigationContainer>
        <Stack.Navigator initialRouteName={initialScreen} screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Connexion" component={ConnexionScreen} />
          <Stack.Screen name="Root" component={DrawerRoot} />
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
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
