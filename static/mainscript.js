var numTop = 10
function updateTable(){
    for(var i = 0; i < numTop; i++){
        let curRank = i+1;
        document.getElementById("team-" + curRank).innerText = ""
        document.getElementById("team-" + curRank+ "-company").innerText = ""
        document.getElementById("team-" + curRank + "-score").innerText = ""
    }
    for(var i = 0; i < Math.min(numTop,top10.length); i++){
        let curRank = i+1;
        let rankTeams = top10[i]
        document.getElementById("team-" + curRank).innerText = rankTeams.map(team => team.teamName).join(', ')
        document.getElementById("team-" + curRank+ "-company").innerText = rankTeams.map(team => team.companyName).join(', ')
        document.getElementById("team-" + curRank + "-score").innerText = ""+rankTeams[0].score
    }
    document.getElementById("lastUpdated").innerText = "Last Updated: " + lastUpdate.toString()
}

function getTeamInfo(){
    let enteredTeam = document.getElementById("team-search").value;
    if(!(enteredTeam in allScores)){
        document.getElementById("team-not-found").hidden = false;
        document.getElementById("search-team").hidden = true;
    } else {
        document.getElementById("team-not-found").hidden = true;
        document.getElementById("search-team").hidden = false;
        document.getElementById("search-team-rank").innerText = allScores[enteredTeam].rank;
        document.getElementById("search-team-name").innerText = allScores[enteredTeam].teamName;
        document.getElementById("search-team-company").innerText = allScores[enteredTeam].companyName;
        document.getElementById("search-team-score").innerText = allScores[enteredTeam].score;
    }
}