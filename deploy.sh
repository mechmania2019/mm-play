#!/bin/bash

docker build . -t gcr.io/mechmania2017/play:latest
docker push gcr.io/mechmania2017/play:latest
kubectl apply -f app.yaml
kubectl delete pods -l app=play