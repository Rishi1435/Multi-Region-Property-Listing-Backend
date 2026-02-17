-- Generate 1000 synthetic rows for US region
INSERT INTO properties (id, price, bedrooms, bathrooms, region_origin)
SELECT 
    i, 
    (random() * 900000 + 100000)::DECIMAL(10,2), 
    floor(random() * 5 + 1)::INT, 
    floor(random() * 3 + 1)::INT, 
    'us'
FROM generate_series(1, 1000) AS s(i);
