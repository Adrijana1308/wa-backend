import mongo from 'mongodb';
import connect from './db';


export default {
    async registerUser(userData){
        let db = await connect();
        await db.collection('users').insert(userData);
        console.log(userData);
    }
}