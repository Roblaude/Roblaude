# Revision code review - scan_restamper.py

## Bloc de contexte extrait du code

```text
scan_restamper.py - Re-stamp /scan_multi au temps courant pour slam_toolbox.

Probleme racine identifie le 22 mai 2026 :
  Les drivers LiDAR Yahboom (YDLidar X2L sur /scan0 et /scan1) publient avec
  un timestamp ~500ms DANS LE FUTUR (drift constant +470 a +580ms mesure).
  Le merger laserscan_multi_merger propage ce drift sur /scan_multi.

Impact sur slam_toolbox :
  Le message_filter interne attend une TF base_footprint->map au temps du
  scan stamp. Si stamp = now+500ms, la TF cache (publiee en wall time) n'a
  jamais d'entree dans le futur -> filter garde le scan en queue -> queue
  deborde -> drop infini -> aucun scan jamais matche -> pas de TF map->odom
  -> Nav2 ne peut pas planifier -> robot immobile.

Solution :
  Souscrire a /scan_multi, copier le message, ecraser msg.header.stamp avec
  un temps wall LEGEREMENT dans le passe (now - stamp_offset), republier sur
  /scan_fixed. Slam_toolbox abonne a /scan_fixed -> trouve la TF dans le cache
  -> match -> publie TF map->odom -> debloque toute la stack.

  Pourquoi pas now() pile : la TF odom->base_footprint (EKF Yahboom) arrive
  avec un petit retard. Si on stampe le scan a now(), la TF a cet instant
  n'est pas encore publiee -> le scan attend dans la queue du message_filter
  -> queue full -> drop (vu IRL meme robot a l'arret). On recule le stamp de
  ~0.2s pour tomber sur une pose odom deja dispo. Biais negligeable a vitesse
  d'exploration (~2-4cm a 5cm/px).

Note : on ne touche PAS a l'odom ni a la TF. L'ekf_filter_node (lance par
base_bringup Yahboom) publie deja /odom et TF odom->base_link avec stamps
corrects, pas de drift cote EKF.
```
