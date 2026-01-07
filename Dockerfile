FROM node:25 AS build-env
COPY . /function
WORKDIR /function

RUN npm ci --no-fund --only=production && npm cache clean --force
RUN npm run tsc

FROM gcr.io/distroless/nodejs24-debian12 AS image
COPY --from=build-env /function /function
EXPOSE 9443
WORKDIR /function
CMD ["dist/main.js"]