import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SelectionSeanceScreen({ navigation }) {
  const [seances, setSeances] = useState([]);

  useEffect(() => {
    const charger = async () => {
      const s = await AsyncStorage.getItem('seances');
      setSeances(s ? JSON.parse(s) : []);
    };

    const unsubscribe = navigation.addListener('focus', charger);
    return unsubscribe;
  }, [navigation]);

     const lancerSeance = (indexSeance) => {
     navigation.navigate('LancerSeance', { indexSeance });
};

  return (
    <View style={styles.container}>
      <View style={{
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  height: 60,
  marginBottom: 20,
  position: 'relative'
}}>
  <TouchableOpacity
  style={{
    position: 'absolute',
    left: 0,
    top: 0,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, // S'assure qu'elle est bien cliquable
  }}
  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
  onPress={() => navigation.goBack()}
>
  <Text style={{ fontSize: 26, color: '#fff', marginBottom: 2 }}>←</Text>
</TouchableOpacity>

  <Text style={{ fontSize: 20, color: '#fff', fontWeight: 'bold', flex: 1, textAlign: 'center' }}>
    Démarrer une séance
  </Text>
</View>

      <FlatList
        data={seances}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item, index }) => (
          <TouchableOpacity style={styles.seanceCard} onPress={() => lancerSeance(index)}>
  <Text style={styles.buttonText}>{item.nom}</Text>
</TouchableOpacity>
        )}
      />
    </View>
    
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    padding: 20
  },
  title: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 20
  },
  seanceCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10
  },
  buttonText: {
    color: '#00aaff',
    fontSize: 16,
    fontWeight: 'bold'
  }
});
