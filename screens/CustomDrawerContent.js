import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function CustomDrawerContent(props) {
  // Pour la déconnexion :
  const handleLogout = async () => {
    await AsyncStorage.removeItem('utilisateurConnecté');
    // Naviguer vers Connexion
    props.navigation.replace('Connexion');
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{flex: 1}}>
      <DrawerItemList {...props} />
      {/* Bouton Déconnexion en bas */}
      <View style={styles.logoutContainer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </View>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  logoutContainer: {
    marginTop: 'auto', // push en bas
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#333'
  },
  logoutButton: {
    backgroundColor: '#aa3333',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center'
  },
  logoutText: {
    color: '#fff',
    fontWeight: 'bold'
  }
});
