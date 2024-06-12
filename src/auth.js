import mongo from 'mongodb';
import connect from './db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';



(async () => {
    try {
        let db = await connect();
        await db.collection('users').createIndex({ username: 1 }, { unique: true });
        console.log('Index created successfully!');
    } catch (error){
        console.log('Error creating index: ', error);
    }
})();

export default {
    async registerUser(userData){
        let db = await connect();

        let doc = {
            username: userData.username,
            password: await bcrypt.hash(userData.password, 10),
            userType: userData.userType, // Add usertype to the schema
            grad: userData.grad,
        };
        try {
            let result = await db.collection('users').insert(doc);
             if (result && result.insertedId){
                 return result.insertedId;
             }
             console.log(doc);
        } catch (error) {
            if (error.code == 11000) {
                console.error(error);
                throw new Error('Username already exists');
            }
            throw error;
        }
    },

    async authenticateUser(username, password){
        let db = await connect();
        let user = await db.collection('users').findOne({ username: username });

        if(user && user.password && (await bcrypt.compare (password, user.password))){
            delete user.password;
            let token = jwt.sign( user, process.env.JWT_SECRET, {
                algorithm : "HS512",
                expiresIn: "1 week"
            }); 
            return{
                token,
                username: user.username,
                userType: user.userType,
                grad: user.grad
            };
        }
        else {
            throw new Error('Invalid username or password');
        }
    },
    verify(req, res, next){
        try{
            let authorization = req.headers.authorization.split(' ');
            let type = authorization[0];
            let token = authorization[1];
            
            if(type !== 'Bearer'){
                return res.status(401).send();
            }
            else{
                req.jwt = jwt.verify(token, process.env.JWT_SECRET);
                return next();
            }
        } catch (error){
            return res.status(401).send({error: 'Unauthorized'});
        }
    }
};