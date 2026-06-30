// shared/car_details_for_cars_list_model.js
'use strict';

class CarDetailsForCarsListModel {
    static setCarDetails(src) {
        const car = src?.toObject ? src.toObject() : (src || {});
        const getFirstImage = (val) => {
            if (Array.isArray(val)) return val.length > 0 ? val[0] : null;
            if (typeof val === 'string') return val || null;
            return null;
        };

        const imageMapping = [
            { field: 'frontMain', title: 'Front View' },
            { field: 'lhsFront45Degree', title: 'Left Front 45°' },
            { field: 'rearMain', title: 'Rear View' },
            { field: 'rearWithBootDoorOpen', title: 'Boot Open View' },
            { field: 'rhsRear45Degree', title: 'Right Rear 45°' },
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
        const isInspected = String(car.approvalStatus || '').toUpperCase() === 'APPROVED';
        const num = (v) => (v == null ? 0 : Number.isFinite(+v) ? +v : 0);
        const int = (v) => (v == null ? 0 : Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : 0);

        return {
            id: (car._id || car.id || '').toString(),
            appointmentId: (car.appointmentId || '').toString(),
            imageUrl,
            make: car.make ?? '',
            model: car.model ?? '',
            variant: car.variant ?? '',
            priceDiscovery: num(car.priceDiscovery),
            yearMonthOfManufacture: car.yearMonthOfManufacture ?? null,
            yearAndMonthOfManufacture: car.yearAndMonthOfManufacture ?? null,
            odometerReadingInKms: int(car.odometerReadingInKms),
            odometerReadingBeforeTestDrive: int(car.odometerReadingBeforeTestDrive),
            ownerSerialNumber: int(car.ownerSerialNumber),
            fuelType: car.fuelType ?? '',
            commentsOnTransmission: car.transmissionTypeDropdownList?.[0] ?? car.commentsOnTransmission ?? '', // Remove this from both frontend and backend in future after release of 2.2.1 update of dealer app
            transmissionTypeDropdownList: car.transmissionTypeDropdownList ?? [],
            roadTaxValidity: car.roadTaxValidity ?? '',
            taxValidTill: car.taxValidTill ?? null,
            registrationNumber: car.registrationNumber ?? '',
            registeredRto: car.registeredRto ?? '',
            registrationState: car.registrationState ?? '',
            registrationDate: car.registrationDate ?? null,
            inspectionLocation: car.city ?? '', // Remove this from both frontend and backend in future after release of 2.2.1 update of dealer app
            inspectionCity: car.inspectionCity ?? '',
            city: car.city ?? '',
            isInspected,
            cubicCapacity: car.cubicCapacity ?? 0,
            oneClickPrice: parseFloat(car.oneClickPrice || 0.0),
            otobuyOffer: parseFloat(car.otobuyOffer || 0.0),
            soldAt: parseFloat(car.soldAt || 0.0),
            highestBid: num(car.highestBid),
            highestBidder: car.highestBidder ?? '',
            auctionStartTime: car.auctionStartTime ?? null,
            auctionEndTime: car.auctionEndTime ?? null,
            auctionDuration: int(car.auctionDuration),
            auctionStatus: car.auctionStatus ?? '',
            upcomingTime: car.upcomingTime ?? null,
            upcomingUntil: car.upcomingUntil ?? null,
            liveAt: car.liveAt ?? null,
            customerExpectedPrice: parseFloat(car.customerExpectedPrice || 0),
            fixedMargin: parseFloat(car.fixedMargin || 0),
            variableMargin: parseFloat(car.variableMargin || 0),
            registeredOwner: car.registeredOwner ?? '',
            registeredAddressAsPerRc: car.registeredAddressAsPerRc ?? '',
            contactNumber: car.contactNumber ?? '',
            emailAddress: car.emailAddress ?? '',
            ieName: car.ieName ?? '',
            chassisNumber: car.chassisNumber ?? '',
            engineNumber: car.engineNumber ?? '',
            imageUrls,
        };
    }
}

module.exports = CarDetailsForCarsListModel;
