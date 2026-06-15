
function addCarToLiveBidsHelper(car) {
    const getFirstImage = (val) => {
        if (Array.isArray(val)) return val.length > 0 ? val[0] : null;
        if (typeof val === 'string') return val || null;
        return null;
    };

    const imageMapping = [
        { field: 'frontMain', title: 'Front View' },
        { field: 'rearMain', title: 'Rear View' },
        { field: 'lhsFront45Degree', title: 'Left Front 45°' },
        { field: 'rhsRear45Degree', title: 'Right Rear 45°' },
        { field: 'rearWithBootDoorOpen', title: 'Boot Open View' },
        { field: 'engineBay', title: 'Engine Compartment' },
        { field: 'meterConsoleWithEngineOn', title: 'Meter Console' },
        { field: 'frontSeatsFromDriverSideDoorOpen', title: 'Front Seats' },
        { field: 'rearSeatsFromRightSideDoorOpen', title: 'Rear Seats' },
        { field: 'dashboardFromRearSeat', title: 'Dashboard View' },
        { field: 'sunroofImages', title: 'Sunroof View' },
    ];

    const imageUrls = imageMapping
        .map(({ field, title }) => {
            const url = getFirstImage(car[field]);
            return url ? { title, url } : null;
        })
        .filter(Boolean);

    const imageUrl = getFirstImage(car.frontMain) || '';

    // IMPORTANT: keys match Flutter model
    return {
        imageUrl,
        appointmentId: (car.appointmentId || '').toString(),
        make: car.make ?? '',
        model: car.model ?? '',
        variant: car.variant ?? '',
        priceDiscovery: Number(car.priceDiscovery || 0),
        yearMonthOfManufacture: car.yearMonthOfManufacture ?? null, // can be ISO or null
        odometerReadingInKms: Number(car.odometerReadingInKms || 0),
        ownerSerialNumber: Number(car.ownerSerialNumber || 0),
        fuelType: car.fuelType ?? '',
        // commentsOnTransmission: car.commentsOnTransmission ?? '',
        commentsOnTransmission: car.transmissionTypeDropdownList?.[0] ?? car.commentsOnTransmission ?? '',
        taxValidTill: car.taxValidTill ?? null,
        registrationNumber: car.registrationNumber ?? '',
        registeredRto: car.registeredRto ?? '',
        inspectionLocation: car.city ?? '',            // ← matches Flutter 'inspectionLocation'
        isInspected: (car.approvalStatus || '').toUpperCase() === 'APPROVED',
        highestBid: Number(car.highestBid || 0),
        auctionStartTime: car.auctionStartTime ?? null,
        auctionEndTime: car.auctionEndTime ?? null,
        auctionDuration: Number(car.auctionDuration || 0),
        auctionStatus: car.auctionStatus ?? '',
        imageUrls,                                     // [{title,url}, ...]
    };
}

module.exports = { addCarToLiveBidsHelper };
