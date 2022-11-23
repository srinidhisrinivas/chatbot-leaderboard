require("dotenv").config()
const express = require('express')
const app = express();
const config = require('./json/config.json')
app.set('view engine', 'ejs')
app.use(express.static('.'));
const participants = require('./src/apiControllers/participantApiController');
const answers = require('./src/apiControllers/answerApiController');
const mongo = require("mongoose");
const PORT = process.env.PORT || 3000
const scheduler = require('node-schedule')
const {RecurrenceRule} = require("node-schedule");

console.log("Connect to db: " + process.env.DB_CONNECTION_STRING)
mongo.connect(process.env.DB_CONNECTION_STRING, { useNewUrlParser: true, useUnifiedTopology: true }, err => {
    if (err) {
        console.log(err);
    } else {
        console.log('\x1b[42m\x1b[30m%s\x1b[0m', `Connected to the database`);
    }
});
console.log("Finish connect to db")

let defaultTeamInfoObject = {
    numCompletedGoalSetting: 0,
    numCompletedReflection: 0,
    numCompletedQuestionnaires: 0,
    numTeamMembers: 0
}

// Object with team names mapping to objects with ranks and scores
let allTeamScores = {}
let top10 = []
let lastUpdatedTime = new Date();
let lastRank = 0;

// Main page
app.get('/', function (req, res){
    // Render the page with the top 10 scores
    //  Object with the scores of all the teams
    //  Last updated time
    res.render('main-full', {
        top: top10,
        allScores: allTeamScores,
        lastUpdated: lastUpdatedTime.toString()
    })
})

// Function to compute a score for a given team based on
// certain parameters that I haven't yet decided on
let computeScore = (teamInfoObject) => {
    if(teamInfoObject.numTeamMembers === 0){
        return 0
    } else {
        return Math.round((teamInfoObject.numCompletedGoalSetting
            + teamInfoObject.numCompletedReflection
            + 3 * teamInfoObject.numCompletedQuestionnaires)
            * 10 / teamInfoObject.numTeamMembers);
    }

}

let extractContinuousInteractions = (allAnswers) => {
    let next_states = {
        'setupQuestions': 'setup',
        'Onboarding': 'onboarding',
        'Morning-Goals-All': 'goal',
        'Pre-Reflection': 'reflection',
        'Int-Reflection': 'reflection',
        'Post-Test': 'questionnaire',
        'Pre-Test': 'questionnaire',
        'Pre-Test-2': 'questionnaire',
        'Follow-Up': 'questionnaire'
    }

    // Possible continuous interactions: setup, onboarding, goal-setting, reflection, post-test
    let interactions = []
    let current_state = 'start'  // setup, onboarding, goal, reflection, post
    let current_interaction = {}
    allAnswers.forEach(answer => {
        let category = answer['qId'].split('.')[0]
        // console.log(category)
        let new_state = next_states[category]
        // console.log(new_state)
        // console.log(current_state)
        if (new_state !== current_state) {
            // console.log("new interaction\n")
            if (!("end" in current_interaction) && ("start" in current_interaction)) {
                current_interaction['end'] = current_interaction['start']
            }
            interactions.push(current_interaction)
            current_interaction = {
                'type': new_state,
                'start': answer
            }
        } else {
            // console.log("old interaction\n")
            if (["[No Response]", "[Repeat Question]"].includes(current_interaction['start']['answer'][0])) {
                current_interaction['start'] = answer
            }
            current_interaction['end'] = answer
        }
        current_state = new_state

    });

    if (!("end" in current_interaction) && ("start" in current_interaction)){
        current_interaction['end'] = current_interaction['start']
    }
    interactions.push(current_interaction)
    interactions.shift()

    return interactions
}

// Function to pull information from that database and update the scores
// in the global variables
let updateAllScores = async () => {
    let tempTeamInfo = {}
    participants.getByExperimentId(config.experimentId)
        .then(allParts => {
            let promiseList = [];
            allParts.forEach(part => {
                let uniqueId = part.uniqueId;
                let teamName = part.parameters.PID;
                teamName = teamName.split("-")[0];
                if(!(teamName in tempTeamInfo)){
                    tempTeamInfo[teamName] = JSON.parse(JSON.stringify(defaultTeamInfoObject))
                }
                promiseList.push(
                    answers.getSingleList(uniqueId)
                        .then(partAnswers => {
                            // Get participant answer info and count number of completed reflections + goal settings
                            let continuousInteractions = extractContinuousInteractions(partAnswers);
                            // console.log(continuousInteractions)
                            let numReflectionComplete = 0
                            let numGoalSettingComplete = 0
                            let numQuestionnairesComplete = 0
                            continuousInteractions.forEach(interaction => {
                                if(interaction["type"] === 'goal'){
                                    numGoalSettingComplete += (interaction['end']['answer'][0] !== "[No Response]")
                                } else if(interaction["type"] === 'reflection'){
                                    numReflectionComplete += (interaction['end']['answer'][0] !== "[No Response]")
                                } else if(interaction["type"] === 'onboarding' || interaction["type"] === 'questionnaire'){
                                    numQuestionnairesComplete += (interaction['end']['answer'][0] !== "[No Response]")
                                }
                            })

                            // Update team information
                            tempTeamInfo[teamName]["numCompletedGoalSetting"] += numGoalSettingComplete
                            tempTeamInfo[teamName]["numCompletedReflection"] += numReflectionComplete
                            tempTeamInfo[teamName]["numCompletedQuestionnaires"] += numQuestionnairesComplete
                            tempTeamInfo[teamName]["numTeamMembers"] += 1
                            // console.log(uniqueId + ", " + teamName + ", " + numGoalSettingComplete);
                            // console.log(tempTeamInfo[teamName])

                        })
                );
            })
            return Promise.all(promiseList)
        })
        .then(ret => {
            // update global team scores object with tempTeamInfo
            // and computeScore
            for(const [teamName, newObj] of Object.entries(tempTeamInfo)){
                if(!(teamName in allTeamScores)){
                    allTeamScores[teamName] = {
                        teamName: teamName,
                        score: 0,
                        rank: 0
                    }
                }
                allTeamScores[teamName]["score"] = computeScore(newObj)
            }

            let teamScoreList = []
            for(const [teamName, obj] of Object.entries(allTeamScores)){
                teamScoreList.push({
                    "teamName": teamName,
                    "score" : obj.score
                })
            }

            // Sort by score in descending order
            teamScoreList.sort((a,b) => {
                return Math.sign(b.score - a.score)
            })

            // update ranks and top 10
            let maxScore = teamScoreList[0].score;
            let currentRank = 1;
            allTeamScores[teamScoreList[0]["teamName"]]["rank"] = currentRank;
            let topTeams = [[allTeamScores[teamScoreList[0]["teamName"]]]];
            // Collect ranks while considering equal scores
            for(let i = 1; i < teamScoreList.length; i++){
                let curTeam = teamScoreList[i];
                if(curTeam.score === maxScore){
                    allTeamScores[curTeam.teamName].rank = currentRank;
                    curTeam["rank"] = currentRank;
                    topTeams[topTeams.length-1].push(curTeam);
                } else {
                    currentRank += 1;
                    allTeamScores[curTeam.teamName].rank = currentRank;
                    maxScore = curTeam.score;
                    curTeam.rank = currentRank
                    topTeams.push([curTeam]);
                }
            }

            // update top 10 list
            top10 = topTeams.slice(0,10);

            // update last updated time
            lastUpdatedTime = new Date();
        })
        .catch(err => {
            console.log(err)
        })
}

let scheduleUpdate = async () => {
    // Use node-schedule to create cronjobs that updates leaderboard every day
    // update the leaderboard every day
    let recRule = new scheduler.RecurrenceRule()
    recRule.dayOfWeek = [0,1,2,3,4,5,6]
    recRule.hour = 6
    scheduler.scheduleJob(recRule, async function(){
        await updateAllScores();
    })
}

updateAllScores()
    .then(ret => {
        return scheduleUpdate();
    })
    .then(ret => {
        console.log("Listening to humans")
        app.listen(PORT)
    })