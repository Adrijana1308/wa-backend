import {MongoClient} from 'mongodb';
//import {Service, Posts} from '.serviceIndex';

let connection_string = 
    'mongodb+srv://admin:admin@atlascluster.m5jen8k.mongodb.net/?retryWrites=true&w=majority&appName=AtlasCluster';

let client = new MongoClient(connection_string);

let db = null

export default () => {
    return new Promise((resolve, reject) => {
        
        if(db && client.isConnected()){
            resolve(db)
        }
        
        client.connect(err => {
            if (err) {
                reject("Došlo je do greške!" + err)
            } else {
                console.log("Uspješno spajanje na bazu!");
                db = client.db("LocksifyDB")
                resolve(db)
            }
        })
    })
 };