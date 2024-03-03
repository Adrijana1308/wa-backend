import express from "express";
import cors from "cors";
import storage from "./memory_storage.js";
import connect from "./db.js";
//import * as res from 'express/lib/response';

const app= express(); //instanciranje aplikacije
const port = 3000; // port na kojem će web server slušati

app.use(cors()); //zahtjevi mogu biti poslati iz drugih domen
app.use(express.json()); //zahtjevi mogu biti u JSON formatu, tj. dekodiraj ih u JSON

app.post('/posts', (req, res) =>{
  let data = req.body; //podaci koji su poslani kroz HTTP zahtjev
  
  //data.id = 1 + storage.posts.reduce((max, e) => Math.max(el.id, max), 0); //auto-increment
  
  //dodaj u našu bazu (lista u memoriji)
  storage.posts.push(data);
  
  //vrati ono što je spremljeno
  res.json(data); //vrati odgovor klijentu tj. podatke za referencu
});

app.get('/posts', async (req, res) => {
  let db = await connect()
  
  let cursor = await db.collection("posts").find().sort({postedAt: -1});
  let results = await cursor.toArray();
  
  console.log(results)
  
  res.json(results)
})

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
