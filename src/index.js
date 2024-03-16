import express from "express";
import cors from "cors";
import storage from "./memory_storage.js";
import connect from "./db.js";
//import * as res from 'express/lib/response';

const app= express(); //instanciranje aplikacije
const port = 3000; // port na kojem će web server slušati

app.use(cors()); //zahtjevi mogu biti poslati iz drugih domen
app.use(express.json()); //zahtjevi mogu biti u JSON formatu, tj. dekodiraj ih u JSON

connect()
    .then(() => {
      console.log("Uspješno spajanje na bazu!");
    })
      .catch((err) => {
        console.error("Došlo je do greške prilikom spajanja na bazu!");
      });

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
      "Access-Control-Allow-Methods",
      "GET,HEAD,OPTIONS,POST,PUT,DELETE"
  );
  res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content Type, Accept, Authorization"
  );
  next();
});

app.post('/posts', async (req, res) =>{
  try{
  let db = await connect();
  let data = req.body; //podaci koji su poslani kroz HTTP zahtjev
  let result = await db.collection("posts").insertOne(data);
  res.json(result.ops[0]);
  } catch (err){
    console.error("Greska pri umetanju posta: ", err);
    res.status(500).json({error: "Server error"});
  }
  //dodaj u našu bazu (lista u memoriji)
  storage.posts.push(data);
  
  //vrati ono što je spremljeno
  res.json(data); //vrati odgovor klijentu tj. podatke za referencu
});

app.get('/posts', async (req, res) => {

  let db = await connect();

  let results;
  try {
    let cursor = await db.collection("posts").find();
    results = await cursor.toArray();
  } catch (e) {
    console.log(e);
  }
  res.json(results);
})

app.get("/GetPosts", async (req, res) => {
  let db = await connect();

  let results;

  try {
    let cursor = await db.collection("Groups").find({});

    results = await cursor.toArray();
  } catch (e) {
    console.log(e);
  }
  res.json(results);
});

app.get('/posts_memory', (req, res) => {
  let posts = storage.posts;
  let query = req.query;
  
  if (query.title) {
    posts = posts.filter(e => e.title.indexOf(query.title) >= 0);
  }
  
  if (query.createdBy) {
    posts = posts.filter(e => e.createdBy.indexOf(query.createdBy) >= 0);
  }
  
  if(query._any){
    let terms = query._any.split(' ');
    posts = posts.filter(doc => {
      let info=doc.title + ' ' + doc.createdBy; 
      return terms.every(term => info.indexOf(term) >= 0); 
    })
  }
  
  //sortiranja
  posts.sort((a, b) => b.postedAt - a.postedAt);
  res.json(posts);
})

app.listen(port, () => console.log(`Slušam na portu ${port}!`));
