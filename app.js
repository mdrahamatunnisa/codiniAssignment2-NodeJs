const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())
const dbPath = path.join(__dirname, 'twitterClone.db')
const MY_SECRET_KEY = 'BeHumble'
let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running')
    })
  } catch (e) {
    console.log(`DB Error : ${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

//API -1
app.post('/register/', async (req, res) => {
  const {username, password, name, gender} = req.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser !== undefined) {
    res.status(400).send('User already exists')
  } else {
    if (password.length < 6) {
      res.status(400).send('Password is too short')
    } else {
      const encryptedPassword = await bcrypt.hash(password, 10)
      const registerUserQuery = `INSERT INTO user (name,username,password,gender) VALUES('${name}','${username}','${encryptedPassword}','${gender}');`
      await db.run(registerUserQuery)
      res.status(200).send('User created successfully')
    }
  }
})

//API -2
app.post('/login/', async (req, res) => {
  const {username, password} = req.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    res.status(400).send('Invalid user')
  } else {
    const isPasswordCorrect = await bcrypt.compare(password, dbUser.password)
    if (isPasswordCorrect) {
      const payload = {user_id: dbUser.user_id}
      const jwtToken = jwt.sign(payload, MY_SECRET_KEY)
      res.send({jwtToken})
    } else {
      res.status(400).send('Invalid password')
    }
  }
})

//Authentication with JWT Token

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  let jwtToken = ''
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    res.status(401).send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, MY_SECRET_KEY, (error, payload) => {
      if (error) {
        res.status(401).send('Invalid JWT Token')
      } else {
        req.user_id = payload.user_id
        next()
      }
    })
  }
}

//API -3
app.get('/user/tweets/feed/', authenticateToken, async (req, res) => {
  const {user_id} = req
  const selectTweetsQuery = `SELECT   
    u.username AS username,
    t.tweet AS tweet,
    t.date_time AS dateTime
  FROM 
      tweet AS t
  JOIN 
      follower AS f ON t.user_id = f.following_user_id
  JOIN 
      user AS u ON t.user_id = u.user_id
  WHERE 
      f.follower_user_id = ${user_id}
  ORDER BY 
      t.date_time DESC
  LIMIT 4 OFFSET 0;
  `
  const tweets = await db.all(selectTweetsQuery)
  res.send(tweets)
})

//API -4
app.get('/user/following/', authenticateToken, async (req, res) => {
  const {user_id} = req
  const selectFollowingUsersQuery = `
  SELECT   
    u.name AS name
  FROM 
      follower AS f 
  JOIN 
      user AS u ON f.following_user_id = u.user_id
  WHERE 
      f.follower_user_id = ${user_id};
  `
  const followingUsers = await db.all(selectFollowingUsersQuery)
  res.send(followingUsers)
})

//API -5
app.get('/user/followers/', authenticateToken, async (req, res) => {
  const {user_id} = req
  const selectFollowersUsersQuery = `SELECT   
    u.name AS name
  FROM 
      follower AS f 
  JOIN 
      user AS u ON f.follower_user_id = u.user_id
  WHERE 
      f.following_user_id = ${user_id};
  `
  const followers = await db.all(selectFollowersUsersQuery)
  res.send(followers)
})

//API -6
app.get('/tweets/:tweetId/', authenticateToken, async (req, res) => {
  try {
    const {user_id} = req
    const {tweetId} = req.params

    // Get the list of users the current user is following
    const selectFollowingUsersQuery = `
      SELECT following_user_id AS user_id
      FROM follower 
      WHERE follower_user_id = ?;
    `
    const followingUsers = await db.all(selectFollowingUsersQuery, [user_id])

    // Get the user_id of the tweet
    const tweetIdUserIdQuery = `SELECT user_id FROM tweet WHERE tweet_id = ?;`
    const tweetIdUserIdObj = await db.get(tweetIdUserIdQuery, [tweetId])
    if (!tweetIdUserIdObj) {
      res.status(404).send('Tweet not found')
      return
    }
    const tweetIdUserId = tweetIdUserIdObj.user_id

    // Check if the user follows the author of the tweet
    const isUserExistInFollowing = followingUsers.some(
      eachUserObj => tweetIdUserId === eachUserObj.user_id,
    )

    if (isUserExistInFollowing) {
      // Fetch tweet details, likes count, and replies count
      const tweetDetailsQuery = `
        SELECT
          t.tweet AS tweet,
          (SELECT COUNT(*) FROM like WHERE tweet_id = ?) AS likes,
          (SELECT COUNT(*) FROM reply WHERE tweet_id = ?) AS replies,
          t.date_time AS dateTime
        FROM
          tweet AS t
        WHERE 
          t.tweet_id = ?;
      `
      const tweetDetails = await db.get(tweetDetailsQuery, [
        tweetId,
        tweetId,
        tweetId,
      ])

      res.send(tweetDetails)
    } else {
      res.status(401).send('Invalid Request')
    }
  } catch (error) {
    console.error(error)
    res.status(500).send('Internal Server Error')
  }
})

//API -7
app.get('/tweets/:tweetId/likes/', authenticateToken, async (req, res) => {
  try {
    const {user_id} = req
    const {tweetId} = req.params

    // Get the list of users the current user is following
    const selectFollowingUsersQuery = `
      SELECT following_user_id AS user_id
      FROM follower 
      WHERE follower_user_id = ?;
    `
    const followingUsers = await db.all(selectFollowingUsersQuery, [user_id])

    // Get the user_id of the tweet
    const tweetIdUserIdQuery = `SELECT user_id FROM tweet WHERE tweet_id = ?;`
    const tweetIdUserIdObj = await db.get(tweetIdUserIdQuery, [tweetId])
    if (!tweetIdUserIdObj) {
      res.status(404).send('Tweet not found')
      return
    }
    const tweetIdUserId = tweetIdUserIdObj.user_id

    // Check if the user follows the author of the tweet
    const isUserExistInFollowing = followingUsers.some(
      eachUserObj => tweetIdUserId === eachUserObj.user_id,
    )

    if (isUserExistInFollowing) {
      // Fetch list of user names who liked the tweet
      const tweetLikedUsernamesQuery = `
      SELECT 
        username
      FROM 
        user 
      NATURAL JOIN like
      WHERE 
        tweet_id = ${tweetId}
      `
      const tweetLikedUsernames = await db.all(tweetLikedUsernamesQuery)
      const usernamesArray = []
      for (let eachUsernameObj of tweetLikedUsernames) {
        usernamesArray.push(eachUsernameObj.username)
      }
      res.send({likes: usernamesArray})
    } else {
      res.status(401).send('Invalid Request')
    }
  } catch (error) {
    console.error(error)
    res.status(500).send('Internal Server Error')
  }
})

//API -8
app.get('/tweets/:tweetId/replies/', authenticateToken, async (req, res) => {
  try {
    const {user_id} = req
    const {tweetId} = req.params

    // Get the list of users the current user is following
    const selectFollowingUsersQuery = `
      SELECT following_user_id AS user_id
      FROM follower 
      WHERE follower_user_id = ?;
    `
    const followingUsers = await db.all(selectFollowingUsersQuery, [user_id])

    // Get the user_id of the tweet
    const tweetIdUserIdQuery = `SELECT user_id FROM tweet WHERE tweet_id = ?;`
    const tweetIdUserIdObj = await db.get(tweetIdUserIdQuery, [tweetId])
    if (!tweetIdUserIdObj) {
      res.status(404).send('Tweet not found')
      return
    }
    const tweetIdUserId = tweetIdUserIdObj.user_id

    // Check if the user follows the author of the tweet
    const isUserExistInFollowing = followingUsers.some(
      eachUserObj => tweetIdUserId === eachUserObj.user_id,
    )

    if (isUserExistInFollowing) {
      // Fetch list of user names who liked the tweet
      const repliesQuery = `
      SELECT 
        name,
        reply
      FROM 
        user 
      NATURAL JOIN reply
      WHERE 
        tweet_id = ${tweetId}
      `
      const repliesArray = await db.all(repliesQuery)

      res.send({replies: repliesArray})
    } else {
      res.status(401).send('Invalid Request')
    }
  } catch (error) {
    console.error(error)
    res.status(500).send('Internal Server Error')
  }
})

//API -9
app.get('/user/tweets/', authenticateToken, async (req, res) => {
  const {user_id} = req

  try {
    const tweetsOfUserQuery = `
      SELECT
        t.tweet AS tweet,
        IFNULL(COUNT(l.like_id), 0) AS likes,
        IFNULL(COUNT(r.reply_id), 0) AS replies,
        t.date_time AS dateTime
      FROM tweet AS t
      LEFT JOIN like AS l
        ON t.tweet_id = l.tweet_id
      LEFT JOIN reply AS r
        ON t.tweet_id = r.tweet_id
      WHERE 
        t.user_id = ?
      GROUP BY 
        t.tweet_id, t.date_time
    `

    const tweetsOfUser = await db.all(tweetsOfUserQuery, [user_id])
    res.send(tweetsOfUser)
  } catch (error) {
    console.error(error)
    res.status(500).send({error: 'Unable to retrieve tweets'})
  }
})

//API -10
app.post('/user/tweets/', authenticateToken, async (req, res) => {
  const {user_id} = req
  const {tweet} = req.body
  const createTweetQuery = `INSERT INTO tweet (tweet,user_id)VALUES('${tweet}',${user_id});`
  await db.run(createTweetQuery)
  res.send('Created a Tweet')
})

//API -11
app.delete('/tweets/:tweetId/', authenticateToken, async (req, res) => {
  const {user_id} = req
  const {tweetId} = req.params

  const getTweetQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`
  const tweetUserIdObj = await db.get(getTweetQuery)
  const tweetUserId = tweetUserIdObj.user_id

  if (tweetUserId === user_id) {
    const deleteTweetQuery = `DELETE FROM  tweet WHERE tweet_id = ${tweetId};`
    await db.run(deleteTweetQuery)
    res.send('Tweet Removed')
  } else {
    res.status(401).send('Invalid Request')
  }
})

module.exports = app
