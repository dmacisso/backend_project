require('dotenv').config();
const jwt = require('jsonwebtoken');
const marked = require('marked');
const bcrypt = require('bcrypt');
const sanitizeHtml = require('sanitize-html');
const cookieParser = require('cookie-parser');
const express = require('express');
const db = require('better-sqlite3')('ourApp.db');
db.pragma('journal_mode = WAL');
const app = express();

//* MARK: Database setup

const createTables = db.transaction(() => {
  // db.prepare(`CREATE TABLE IF NOT EXISTS users (
  //   id INTEGER PRIMARY KEY AUTOINCREMENT,
  //   username TEXT,
  //   password TEXT
  // )`, (err) => {
  //   if (err) {
  //     console.error(err.message);
  //   } else {
  //     console.log('Table created successfully.');
  //   }
  // }).run();
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
    )
    `
  ).run();

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    createdDate TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    authorid INTEGER,
    FOREIGN KEY (authorid) REFERENCES users(id)
  )`
  ).run();
});

createTables();

//* End database setup

//* use ejs
//* ejs requires a "views" default folder in the project root
app.set('view engine', 'ejs');

//* Define project static files folder.
app.use(express.static('public'));

//* Configure body parsing of form data
app.use(express.urlencoded({ extended: false }));

//* Call cookie parser before any routes
app.use(cookieParser());

//* MARK:Middleware Global - gets in the middle of every req/res anytime a req or res life cycle begins,
app.use(function (req, res, next) {
  //* make marked available to templates
  res.locals.filterUserHTML = function (content) {
    return sanitizeHtml(
      marked.parse(content, {
        allowedTags: [
          'p',
          'br',
          'bold',
          'i',
          'em',
          'strong',
          'ul',
          'ol',
          'li',
          'hr',
          'link',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
        ],
        allowedAttributes: {},
      })
    );
  };
  res.locals.errors = [];
  //*  locals is how you make something available to the template/view system.

  // try to decode the cookie
  try {
    const decoded = jwt.verify(req.cookies.simpleApp, process.env.JWTSECRET);
    req.user = decoded;
  } catch (error) {
    req.user = false;
  }
  res.locals.user = req.user;
  console.log(req.user);

  next();
  //*  next() is a function that lets you move on to the next piece of middleware
});

//* MARK: Routing
app.get('/', (req, res) => {
  if (req.user) {
    const postsStatement = db.prepare(
      'SELECT * FROM posts WHERE authorid = ? ORDER BY createdDate DESC'
    );

    const posts = postsStatement.all(req.user.userid);

    return res.render('dashboard', { posts }); //* return prevents the function from continuing
  }
  res.render('homepage');
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.get('/logout', (req, res) => {
  res.clearCookie('simpleApp');
  res.redirect('/');
});

//* MARK: Create Posts

//*  Middleware only used for specific routes
function mustBeLoggedIn(req, res, next) {
  if (req.user) {
    return next();
  } else {
    return res.redirect('/login');
  }
}

app.get('/create-post', mustBeLoggedIn, (req, res) => {
  res.render('create-post');
});

function sharedPostValidation(req) {
  let errors = [];
  if (typeof req.body.title !== 'string') req.body.title = '';
  if (typeof req.body.body !== 'string') req.body.body = '';

  //* MARK: Sanitize or strip html tags
  req.body.title = sanitizeHtml(req.body.title.trim(), {
    allowedTags: [],
    allowedAttributes: {},
  });
  req.body.body = sanitizeHtml(req.body.body.trim(), {
    allowedTags: [],
    allowedAttributes: {},
  });

  if (!req.body.title) errors.push('A title is required');
  if (!req.body.body) errors.push('Body content is required');

  return errors;
}

app.get('/edit-post/:id', mustBeLoggedIn, (req, res) => {
  // try to lookup the post in question
  const statement = db.prepare('SELECT * FROM posts WHERE id = ?');
  const post = statement.get(req.params.id);

  if (!post) {
    return res.redirect('/');
  }

  // if not author, redirect to homepage.
  if (post.authorid !== req.user.userid) {
    return res.redirect('/');
  }
  // author, render edit-post.ejs template
  return res.render('edit-post', { post });
});

app.post('/edit-post/:id', mustBeLoggedIn, (req, res) => {
  // try to lookup the post in question
  const statement = db.prepare('SELECT * FROM posts WHERE id = ?');
  const post = statement.get(req.params.id);

  if (!post) {
    return res.redirect('/');
  }

  // if not author, redirect to homepage.
  if (post.authorid !== req.user.userid) {
    return res.redirect('/');
  }

  const errors = sharedPostValidation(req);
  if (errors.length) {
    return res.render('edit-post', { post, errors });
  }

  const updateStatement = db.prepare(
    'UPDATE posts SET title = ?, body = ? WHERE id = ?'
  );
  updateStatement.run(req.body.title, req.body.body, req.params.id);
  return res.redirect(`/post/${req.params.id}`);
});

app.post('/delete-post/:id', mustBeLoggedIn, (req, res) => {
  // try to lookup the post in question
  const statement = db.prepare('SELECT * FROM posts WHERE id = ?');
  const post = statement.get(req.params.id);

  if (!post) {
    return res.redirect('/');
  }

  // if not author, redirect to homepage.
  if (post.authorid !== req.user.userid) {
    return res.redirect('/');
  }

  const deleteStatement = db.prepare('DELETE FROM posts WHERE id = ?');
  deleteStatement.run(req.params.id);
  return res.redirect('/');
});

app.get('/post/:id', mustBeLoggedIn, (req, res) => {
  const getPostStatement = db.prepare(
    'SELECT posts.*, users.username FROM posts INNER JOIN users ON posts.authorid = users.id  WHERE posts.id = ?'
  );
  const post = getPostStatement.get(req.params.id);

  if (!post) {
    return res.redirect('/');
  }
  const isAuthor = post.authorid === req.user.userid;

  return res.render('single-post', { post, isAuthor });
});

app.post('/create-post', mustBeLoggedIn, (req, res) => {
  const errors = sharedPostValidation(req);
  if (errors.length) {
    return res.render('create-post', { errors });
  }

  //* store in database
  const insertStatement = db.prepare(
    'INSERT INTO posts (title, body, authorid, createdDate) VALUES (?, ?,?, ?)'
  );
  const result = insertStatement.run(
    req.body.title,
    req.body.body,
    req.user.userid,
    new Date().toISOString()
  );

  const getPostStatement = db.prepare('SELECT * FROM posts WHERE ROWID = ?');
  const post = getPostStatement.get(result.lastInsertRowid);
  res.redirect(`/post/${post.id}`);
});

app.post('/login', (req, res) => {
  let errors = [];
  if (typeof req.body.username !== 'string') req.body.username = '';
  if (typeof req.body.password !== 'string') req.body.password = '';

  if (req.body.username.trim() === '') errors = ['Invalid username/password'];
  if (req.body.password === '') errors = ['Invalid username/password'];

  if (errors.length) {
    return res.render('login', { errors });
  }

  const userInQuestionStatement = db.prepare(
    'SELECT * FROM users WHERE username = ?'
  );
  const userInQuestion = userInQuestionStatement.get(req.body.username);
  if (!userInQuestion) {
    errors = ['Invalid username/password'];
    return res.render('login', { errors });
  }

  const matchOrNot = bcrypt.compareSync(
    req.body.password,
    userInQuestion.password
  );

  if (!matchOrNot) {
    errors = ['Invalid username/password'];
    return res.render('login', { errors });
  }

  //* Login User by giving them a cookie
  const tokenValue = jwt.sign(
    {
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      skyColor: 'blue',
      userid: userInQuestion.id,
      username: userInQuestion.username,
    },
    process.env.JWTSECRET
  );

  res.cookie('simpleApp', tokenValue, {
    httpOnly: true, // don't allow javascript to access the cookie
    secure: true, // only send over https, does not apply to localhost
    sameSite: 'strict', // only send on same site requests
    maxAge: 1000 * 60 * 60 * 24, // 1 day
  });
  res.redirect('/');
});

//* MARK: Register User
app.post('/register', (req, res) => {
  let errors = [];
  if (typeof req.body.username !== 'string') req.body.username = '';
  if (typeof req.body.password !== 'string') req.body.password = '';

  req.body.username = req.body.username.trim();
  //* Validate Name
  if (!req.body.username) errors.push('Must provide a username');
  if (req.body.username && req.body.username.length < 3)
    errors.push('Username must be at least 3 characters');
  if (req.body.username && req.body.username.length > 10)
    errors.push('Username cannot exceed 10 characters');
  if (req.body.username && !req.body.username.match(/^[a-zA-Z0-9]+$/))
    errors.push('Username can only contain letters and numbers');
  //* Check if username already exists
  const usernameStatement = db.prepare(
    'SELECT * FROM users WHERE username = ?'
  );
  const usernameCheck = usernameStatement.get(req.body.username);
  if (usernameCheck) errors.push('That username already exists');

  //* Validate Password
  if (!req.body.password) errors.push('Must provide a password');
  if (req.body.password && req.body.password.length < 3)
    errors.push('Password must be at least 8 characters');
  if (req.body.password && req.body.password.length > 70)
    errors.push('Password cannot exceed 70 characters');

  if (errors.length) {
    return res.render('homepage', { errors });
  }
  //* Input passed Validation - no Errors
  //* MARK: Save new user in a database
  const inputStatement = db.prepare(
    'INSERT INTO users (username, password) VALUES (?, ?)'
  );
  //* Insert new user into database. Best practice is to hash passwords.
  const salt = bcrypt.genSaltSync(10); // 10 rounds of hashing
  req.body.password = bcrypt.hashSync(req.body.password, salt); // hash password
  const result = inputStatement.run(req.body.username, req.body.password); // insert new user into database
  const lookupStatement = db.prepare('SELECT * FROM users WHERE ROWID = ?');
  const ourUser = lookupStatement.get(result.lastInsertRowid);

  const tokenValue = jwt.sign(
    {
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      skyColor: 'blue',
      userid: ourUser.id,
      username: ourUser.username,
    },
    process.env.JWTSECRET
  );

  //* Login User by giving them a cookie
  res.cookie('simpleApp', tokenValue, {
    httpOnly: true, // don't allow javascript to access the cookie
    secure: true, // only send over https, does not apply to localhost
    sameSite: 'strict', // only send on same site requests
    maxAge: 1000 * 60 * 60 * 24, // 1 day
  });
  res.redirect('/');
});

//* MARK: Run Server on port 3000
app.listen(3000);
