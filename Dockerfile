FROM nginx:alpine
COPY pyra-desierto-v13.html /usr/share/nginx/html/index.html
RUN echo 'server { listen 3000; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 3000
