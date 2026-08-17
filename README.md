# Puy du Fou — Planner famille

Planner mobile/PWA pour les 18 et 19 août 2026.

## Moteur v1.3

Le planning n'est plus construit par choix glouton du « prochain meilleur spectacle ». `solver.js` optimise les 7 spectacles prioritaires O sur les deux jours comme un ensemble, puis insère les activités secondaires uniquement dans les créneaux qui ne fragilisent pas ce squelette.

Ordre d'arbitrage : couverture des O → stratégie d'ouverture contre-courant → robustesse des marges → chaleur → trajectoire H/M/B → dernières chances → marche / heuristique d'affluence.

Le 18 est basé sur le programme officiel édité le 17/08/2026 à 19:48. Le 19 reste provisoire tant que son programme officiel n'a pas été injecté.

L'application fonctionne hors ligne après le premier chargement HTTPS et conserve sa progression dans `localStorage`. Si le solveur ne peut plus garantir tous les O, l'interface demande explicitement un arbitrage ChatGPT et prépare un état `PUY_STATE_V2` à copier.
