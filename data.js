window.PUY_DATA = {
  sourceEdit: "17/08/2026 19:48",
  appVersion: "1.3.0",
  engineVersion: 2,
  placementPriorityMin: 40,
  normalShowBufferMin: 10,
  fillerSafetyMin: 12,
  comfortSlackMin: 10,
  opening: {18:"09:00",19:"09:00"},
  planningEnd: {18:"20:00",19:"20:30"},
  heatWindow: {18:[810,1005],19:[810,1005]},
  travel: {
    H:{H:8,M:14,B:22},
    M:{H:14,M:7,B:14},
    B:{H:22,M:14,B:8}
  },
  strategy: {
    label:"Contre-courant",
    deepStartDay:18,
    deepZone:"H",
    deepStartBestBefore:"10:45",
    deepStartGoodBefore:"11:45",
    entranceZone:"B",
    earlyEntranceZoneUntil:"11:15"
  },
  activities: [
    {id:1,name:"Le Signe du Triomphe",zone:"H",priority:true,covered:false,duration:35,sessions:["11:15","14:15","17:00"]},
    {id:2,name:"Les Vikings",zone:"H",priority:true,covered:false,duration:26,sessions:["10:45","12:15","14:45","16:15","18:30"]},
    {id:3,name:"Le Bal des Oiseaux Fantômes",zone:"H",priority:true,covered:false,duration:33,sessions:["10:15","11:45","14:00","15:30","17:30"]},
    {id:4,name:"Le Secret de la Lance",zone:"B",priority:true,covered:false,duration:29,sessions:["10:30","12:45","15:45","17:30"]},
    {id:5,name:"Mousquetaire de Richelieu",zone:"B",priority:true,covered:true,duration:32,sessions:["10:30","11:45","15:15","16:30","18:15"]},
    {id:6,name:"Le Dernier Panache",zone:"M",priority:true,covered:true,duration:34,sessions:["09:45","11:00","12:15","15:15","16:30","18:15","19:30"]},
    {id:7,name:"Le Mime et l'Étoile",zone:"B",priority:true,covered:true,duration:28,sessions:["09:30","12:30","13:45","15:00","17:45","19:00","20:15"]},
    {id:8,name:"La Renaissance du Château",zone:"B",priority:false,covered:true,duration:30,continuous:[["09:30","12:15"],["15:15","19:00"]]},
    {id:9,name:"L'Épée du Roi Arthur",zone:"H",priority:false,covered:false,duration:22,sessions:["10:00","11:00","13:00","14:00","15:00","16:00","17:30","18:30","19:30"]},
    {id:10,name:"Le Premier Royaume",zone:"M",priority:false,covered:true,duration:18,continuous:[["10:30","17:45"]]},
    {id:11,name:"Les Automates Musiciens",zone:"B",priority:false,covered:false,duration:7,sessions:["10:30","11:45","12:30","15:00","17:15","19:15","20:15"]},
    {id:12,name:"Le Grand Carillon",zone:"M",priority:false,covered:false,duration:10,sessions:["11:30","14:00","15:30","17:15","19:45"]},
    {id:13,name:"Les Grandes Eaux",zone:"M",priority:false,covered:false,duration:8,sessions:["10:00","12:15","13:00","14:00"]},
    {id:18,name:"Le Mystère de La Pérouse",zone:"H",priority:false,covered:true,duration:20,continuous:[["10:15","20:30"]]},
    {id:19,name:"Les Amoureux de Verdun",zone:"M",priority:false,covered:true,duration:15,continuous:[["11:15","19:30"]]}
  ],
  fixed: {
    18:[
      {kind:"fixed",id:"dinner",start:"20:00",duration:75,zone:"B",name:"Café de la Madelon — rendez-vous",note:"Réservation 20:15 · durée estimée"},
      {kind:"fixed",id:"noces",start:"22:00",duration:30,zone:"M",name:"Les Noces de Feu",note:"Spectacle nocturne",arrivalBuffer:20}
    ],
    19:[]
  },
  fallbackPlans: {
    18:[
      {kind:"show",id:3,start:"10:15"},
      {kind:"show",id:2,start:"12:15"},
      {kind:"show",id:1,start:"17:00"},
      {kind:"fixed",id:"dinner",start:"20:00",duration:75,zone:"B",name:"Café de la Madelon — rendez-vous",note:"Réservation 20:15 · durée estimée"},
      {kind:"fixed",id:"noces",start:"22:00",duration:30,zone:"M",name:"Les Noces de Feu",note:"Spectacle nocturne",arrivalBuffer:20}
    ],
    19:[
      {kind:"show",id:4,start:"10:30"},
      {kind:"show",id:7,start:"13:45"},
      {kind:"show",id:5,start:"16:30"},
      {kind:"show",id:6,start:"18:15"}
    ]
  }
};
