function showSentraCore() {

  const html = HtmlService
      .createHtmlOutputFromFile("SentraCore")
      .setTitle("SentraCore")
      .setWidth(1500)
      .setHeight(900);

  SpreadsheetApp
      .getUi()
      .showModalDialog(html,"SentraCore");

}


function onOpen(){

SpreadsheetApp.getUi()

.createMenu("SentraCore")

.addItem("Open Platform","showSentraCore")

.addToUi();

function getUsers(){

const sheet=SpreadsheetApp
.getActive()
.getSheetByName("USERS");

const values=sheet.getDataRange().getValues();

const users=[];

for(let i=1;i<values.length;i++){

users.push({

id:values[i][0],

name:values[i][1],

role:values[i][3],

specialization:values[i][4],

facility:values[i][5],

workload:values[i][6],

status:values[i][8]

});

}

return users;

}

function getUsersPage(){

return HtmlService
.createHtmlOutputFromFile("Users")
.getContent();

}

}